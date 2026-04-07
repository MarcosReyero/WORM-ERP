import logging
import os
import socket
import sys
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.db import IntegrityError, close_old_connections
from django.db.models import F, Q
from django.utils import timezone

from .models import InventoryAutomationTaskState, MinimumStockDigestConfig, SafetyStockAlertRule

AUTOMATION_LOGGER = logging.getLogger("inventory.automation")
BOOTSTRAP_LOGGER = logging.getLogger("inventory.automation.bootstrap")
LEASE_LOGGER = logging.getLogger("inventory.automation.lease")
RECONCILE_LOGGER = logging.getLogger("inventory.automation.reconcile")
DIGEST_LOGGER = logging.getLogger("inventory.automation.digest")

TASK_KEY_SCHEDULER = "scheduler"
TASK_KEY_MINIMUM_STOCK_RECONCILE = "minimum_stock_reconcile"
TASK_KEY_MINIMUM_STOCK_DIGEST = "minimum_stock_digest"
AUTOMATION_TASK_KEYS = (
    TASK_KEY_SCHEDULER,
    TASK_KEY_MINIMUM_STOCK_RECONCILE,
    TASK_KEY_MINIMUM_STOCK_DIGEST,
)

_RUNNER_LOCK = threading.Lock()
_RUNNER_INSTANCE = None


@dataclass
class LeaseAcquireResult:
    acquired: bool
    task_state: InventoryAutomationTaskState
    takeover: bool = False
    previous_owner_label: str = ""
    previous_heartbeat_at: datetime | None = None


def _runner_owner_label(thread_name):
    return f"{socket.gethostname()}:{os.getpid()}:{thread_name}"


def ensure_automation_task_state(task_key):
    defaults = {
        "runtime_state": InventoryAutomationTaskState.RuntimeState.IDLE,
    }
    try:
        state, _created = InventoryAutomationTaskState.objects.get_or_create(
            key=task_key,
            defaults=defaults,
        )
        return state
    except IntegrityError:
        return InventoryAutomationTaskState.objects.get(key=task_key)


def ensure_automation_task_states():
    return {
        task_key: ensure_automation_task_state(task_key)
        for task_key in AUTOMATION_TASK_KEYS
    }


def get_automation_task_state(task_key):
    return InventoryAutomationTaskState.objects.filter(key=task_key).first()


def is_task_state_stale(task_state, now=None):
    if not task_state or not task_state.lease_expires_at:
        return False
    now = now or timezone.now()
    return task_state.runtime_state == InventoryAutomationTaskState.RuntimeState.RUNNING and task_state.lease_expires_at < now


def try_acquire_lease(task_key, owner_token, owner_label, ttl_seconds, now=None):
    now = now or timezone.now()
    lease_expires_at = now + timedelta(seconds=ttl_seconds)
    task_state = ensure_automation_task_state(task_key)
    previous_owner_label = task_state.owner_label
    previous_heartbeat_at = task_state.heartbeat_at
    takeover = bool(task_state.owner_token and is_task_state_stale(task_state, now=now))

    updated = (
        InventoryAutomationTaskState.objects.filter(key=task_key)
        .filter(
            Q(lease_expires_at__isnull=True)
            | Q(lease_expires_at__lt=now)
            | Q(owner_token="")
        )
        .update(
            runtime_state=InventoryAutomationTaskState.RuntimeState.RUNNING,
            owner_token=owner_token,
            owner_label=owner_label,
            lease_expires_at=lease_expires_at,
            heartbeat_at=now,
            last_started_at=now,
            run_count=F("run_count") + 1,
        )
    )
    refreshed_state = InventoryAutomationTaskState.objects.get(key=task_key)

    if updated:
        if takeover:
            LEASE_LOGGER.warning(
                "lease_takeover",
                extra={
                    "task_key": task_key,
                    "owner_token": owner_token,
                    "owner_label": owner_label,
                    "previous_owner_label": previous_owner_label,
                    "previous_heartbeat_at": (
                        previous_heartbeat_at.isoformat() if previous_heartbeat_at else None
                    ),
                },
            )
        LEASE_LOGGER.info(
            "lease_acquired",
            extra={
                "task_key": task_key,
                "owner_token": owner_token,
                "owner_label": owner_label,
                "lease_expires_at": lease_expires_at.isoformat(),
                "takeover": takeover,
                "previous_owner_label": previous_owner_label,
                "previous_heartbeat_at": (
                    previous_heartbeat_at.isoformat() if previous_heartbeat_at else None
                ),
            },
        )
    return LeaseAcquireResult(
        acquired=bool(updated),
        task_state=refreshed_state,
        takeover=takeover and bool(updated),
        previous_owner_label=previous_owner_label,
        previous_heartbeat_at=previous_heartbeat_at,
    )


def renew_lease(task_key, owner_token, ttl_seconds, now=None):
    now = now or timezone.now()
    lease_expires_at = now + timedelta(seconds=ttl_seconds)
    updated = (
        InventoryAutomationTaskState.objects.filter(
            key=task_key,
            owner_token=owner_token,
            runtime_state=InventoryAutomationTaskState.RuntimeState.RUNNING,
            lease_expires_at__gte=now,
        ).update(
            lease_expires_at=lease_expires_at,
            heartbeat_at=now,
        )
    )
    if updated:
        LEASE_LOGGER.info(
            "lease_renewed",
            extra={
                "task_key": task_key,
                "owner_token": owner_token,
                "lease_expires_at": lease_expires_at.isoformat(),
            },
        )
    else:
        LEASE_LOGGER.warning(
            "lease_lost",
            extra={
                "task_key": task_key,
                "owner_token": owner_token,
            },
        )
    return bool(updated)


def finish_task_run(
    task_key,
    owner_token,
    outcome,
    now=None,
    processed_count=None,
    warning_message="",
    error_message="",
):
    now = now or timezone.now()
    update_kwargs = {
        "runtime_state": InventoryAutomationTaskState.RuntimeState.IDLE,
        "owner_token": "",
        "owner_label": "",
        "lease_expires_at": None,
        "heartbeat_at": now,
        "last_finished_at": now,
        "last_run_status": outcome,
        "last_processed_count": processed_count,
        "last_warning_message": warning_message,
        "last_error_message": error_message,
    }
    if outcome == InventoryAutomationTaskState.LastRunStatus.SUCCESS:
        update_kwargs["last_success_at"] = now
        update_kwargs["last_error_message"] = ""
        update_kwargs["last_warning_message"] = ""
    elif outcome == InventoryAutomationTaskState.LastRunStatus.WARNING:
        update_kwargs["last_warning_at"] = now
        update_kwargs["last_error_message"] = ""
    elif outcome == InventoryAutomationTaskState.LastRunStatus.ERROR:
        update_kwargs["last_error_at"] = now
        update_kwargs["last_warning_message"] = warning_message
    elif outcome == InventoryAutomationTaskState.LastRunStatus.SKIPPED:
        update_kwargs["last_error_message"] = ""

    updated = InventoryAutomationTaskState.objects.filter(
        key=task_key,
        owner_token=owner_token,
    ).update(**update_kwargs)
    return bool(updated)


def serialize_automation_task_state(task_state, now=None):
    now = now or timezone.now()
    if not task_state:
        return {
            "key": None,
            "runtime_state": InventoryAutomationTaskState.RuntimeState.IDLE,
            "runtime_state_label": InventoryAutomationTaskState.RuntimeState.IDLE.label,
            "is_stale": False,
            "owner_label": "",
            "lease_expires_at": None,
            "heartbeat_at": None,
            "last_started_at": None,
            "last_finished_at": None,
            "last_success_at": None,
            "last_warning_at": None,
            "last_error_at": None,
            "last_run_status": InventoryAutomationTaskState.LastRunStatus.NEVER,
            "last_run_status_label": InventoryAutomationTaskState.LastRunStatus.NEVER.label,
            "last_error_message": "",
            "last_warning_message": "",
            "run_count": 0,
            "last_processed_count": None,
        }

    is_stale = is_task_state_stale(task_state, now=now)
    return {
        "key": task_state.key,
        "runtime_state": task_state.runtime_state,
        "runtime_state_label": task_state.get_runtime_state_display(),
        "is_stale": is_stale,
        "owner_label": task_state.owner_label,
        "lease_expires_at": task_state.lease_expires_at.isoformat()
        if task_state.lease_expires_at
        else None,
        "heartbeat_at": task_state.heartbeat_at.isoformat() if task_state.heartbeat_at else None,
        "last_started_at": task_state.last_started_at.isoformat()
        if task_state.last_started_at
        else None,
        "last_finished_at": task_state.last_finished_at.isoformat()
        if task_state.last_finished_at
        else None,
        "last_success_at": task_state.last_success_at.isoformat()
        if task_state.last_success_at
        else None,
        "last_warning_at": task_state.last_warning_at.isoformat()
        if task_state.last_warning_at
        else None,
        "last_error_at": task_state.last_error_at.isoformat()
        if task_state.last_error_at
        else None,
        "last_run_status": task_state.last_run_status,
        "last_run_status_label": task_state.get_last_run_status_display(),
        "last_error_message": task_state.last_error_message,
        "last_warning_message": task_state.last_warning_message,
        "run_count": task_state.run_count,
        "last_processed_count": task_state.last_processed_count,
    }


def _localize_schedule(dt_value):
    if timezone.is_naive(dt_value):
        return timezone.make_aware(dt_value, timezone.get_current_timezone())
    return timezone.localtime(dt_value)


def get_minimum_stock_digest_due_context(config, now=None):
    now = timezone.localtime(now or timezone.now())
    run_at = config.run_at

    if config.frequency == MinimumStockDigestConfig.Frequency.WEEKLY:
        week_start = now.date() - timedelta(days=now.weekday())
        target_date = week_start + timedelta(days=config.run_weekday)
        scheduled_at = _localize_schedule(datetime.combine(target_date, run_at))
        due_key = f"weekly:{target_date.isoformat()}" if now >= scheduled_at else ""
        next_run_at = scheduled_at if now < scheduled_at else scheduled_at + timedelta(days=7)
        return {
            "due": bool(due_key),
            "due_key": due_key,
            "due_at": scheduled_at,
            "next_run_at": next_run_at,
        }

    scheduled_at = _localize_schedule(datetime.combine(now.date(), run_at))
    due_key = f"daily:{now.date().isoformat()}" if now >= scheduled_at else ""
    next_run_at = scheduled_at if now < scheduled_at else scheduled_at + timedelta(days=1)
    return {
        "due": bool(due_key),
        "due_key": due_key,
        "due_at": scheduled_at,
        "next_run_at": next_run_at,
    }


def is_reconcile_due(now=None):
    now = now or timezone.now()
    task_state = ensure_automation_task_state(TASK_KEY_MINIMUM_STOCK_RECONCILE)
    if task_state.runtime_state == InventoryAutomationTaskState.RuntimeState.RUNNING and not is_task_state_stale(
        task_state,
        now=now,
    ):
        return False
    if not task_state.last_started_at:
        return True
    interval_seconds = getattr(settings, "INVENTORY_MINIMUM_STOCK_RECONCILE_SECONDS", 600)
    return now >= task_state.last_started_at + timedelta(seconds=interval_seconds)


def claim_minimum_stock_digest_period(config, due_key, now=None):
    now = now or timezone.now()
    claim_timeout = timedelta(
        seconds=getattr(settings, "INVENTORY_AUTOMATION_DIGEST_LEASE_SECONDS", 300)
    )
    stale_before = now - claim_timeout
    previous_config = MinimumStockDigestConfig.objects.filter(pk=config.pk).first()
    if not previous_config:
        return False, False
    if previous_config.last_period_key == due_key:
        return False, False
    if (
        previous_config.inflight_period_key == due_key
        and previous_config.last_delivery_status == MinimumStockDigestConfig.DeliveryStatus.ERROR
    ):
        return False, False

    takeover = bool(
        previous_config.inflight_period_key == due_key
        and previous_config.inflight_started_at
        and previous_config.inflight_started_at < stale_before
        and previous_config.last_delivery_status != MinimumStockDigestConfig.DeliveryStatus.ERROR
    )
    updated = (
        MinimumStockDigestConfig.objects.filter(pk=config.pk)
        .exclude(last_period_key=due_key)
        .filter(
            Q(inflight_period_key="")
            | ~Q(inflight_period_key=due_key)
            | Q(inflight_started_at__isnull=True)
            | Q(inflight_started_at__lt=stale_before)
        )
        .update(
            inflight_period_key=due_key,
            inflight_started_at=now,
        )
    )
    if updated:
        DIGEST_LOGGER.info(
            "digest_claimed",
            extra={
                "period_key": due_key,
                "takeover": takeover,
            },
        )
    return bool(updated), takeover and bool(updated)


def mark_minimum_stock_digest_result(
    config_id,
    due_key,
    delivery_status,
    now=None,
    summary_count=None,
    email_error="",
    recipient_warning="",
    consume_period=False,
):
    now = now or timezone.now()
    update_kwargs = {
        "last_delivery_status": delivery_status,
        "last_summary_count": summary_count,
        "last_email_error": email_error,
        "last_recipient_warning": recipient_warning,
    }
    if consume_period:
        update_kwargs["last_period_key"] = due_key
        update_kwargs["inflight_period_key"] = ""
        update_kwargs["inflight_started_at"] = None
    if delivery_status == MinimumStockDigestConfig.DeliveryStatus.SUCCESS:
        update_kwargs["last_notified_at"] = now
    MinimumStockDigestConfig.objects.filter(pk=config_id).update(**update_kwargs)


def _detect_management_command(argv):
    if len(argv) < 2:
        return ""
    return argv[1].casefold()


def should_bootstrap_inventory_automation(argv=None, environ=None):
    argv = argv or sys.argv
    environ = environ or os.environ
    if not getattr(settings, "INVENTORY_AUTOMATION_ENABLED", True):
        return False

    command = _detect_management_command(argv)
    blocked_commands = {
        "test",
        "migrate",
        "makemigrations",
        "collectstatic",
        "shell",
        "dbshell",
        "createsuperuser",
        "check",
    }
    if command in blocked_commands:
        return False
    
    # En modo dev (DEBUG=True), siempre iniciar worker con runserver
    # En modo prod, solo si RUN_MAIN=true (proceso reloader)
    if command == "runserver":
        is_dev = getattr(settings, "DEBUG", False)
        if is_dev:
            # Modo desarrollo: siempre iniciar en runserver
            return True
        else:
            # Modo producción: solo en proceso principal del reloader
            return environ.get("RUN_MAIN") == "true"
    
    return True


class InventoryAutomationRunner(threading.Thread):
    def __init__(self):
        super().__init__(name="inventory-automation-runner", daemon=True)
        self.stop_event = threading.Event()
        self.owner_token = f"scheduler-{uuid.uuid4().hex}"
        self.owner_label = _runner_owner_label(self.name)
        self._last_busy_log_at = {}
        self._scheduler_has_lease = False

    def stop(self):
        """Señala graceful shutdown. Público para tests."""
        self.stop_event.set()

    def is_running(self):
        """Retorna True si el loop está activo. Público para tests."""
        return not self.stop_event.is_set()

    def _simulate_tick(self, mock_now=None):
        """
        Ejecuta un tick del loop sin scheduler (útil para tests).
        Parámetros:
        - mock_now: datetime que reemplaza timezone.now() para este tick
        
        Retorna True si el tick se ejecutó sin excepciones.
        """
        try:
            now = mock_now or timezone.now()
            
            # Simula un ciclo: intenta adquirir scheduler, evalúa jobs
            if self._ensure_scheduler_lease():
                if is_reconcile_due(now=now):
                    self.run_reconcile_job()
                self.run_digest_job_if_due()
            
            return True
        except Exception as e:
            AUTOMATION_LOGGER.error(f"simulate_tick_failed: {e}")
            return False

    def _busy_log_allowed(self, task_key):
        last_logged = self._last_busy_log_at.get(task_key)
        now = time.monotonic()
        if last_logged is None or now - last_logged >= getattr(
            settings,
            "INVENTORY_AUTOMATION_POLL_SECONDS",
            60,
        ):
            self._last_busy_log_at[task_key] = now
            return True
        return False

    def _ensure_scheduler_lease(self):
        now = timezone.now()
        ttl_seconds = getattr(settings, "INVENTORY_AUTOMATION_SCHEDULER_LEASE_SECONDS", 90)
        if self._scheduler_has_lease:
            if renew_lease(TASK_KEY_SCHEDULER, self.owner_token, ttl_seconds, now=now):
                return True
            self._scheduler_has_lease = False
            return False

        LEASE_LOGGER.info(
            "lease_acquire_attempt",
            extra={
                "task_key": TASK_KEY_SCHEDULER,
                "owner_token": self.owner_token,
                "owner_label": self.owner_label,
            },
        )
        lease = try_acquire_lease(
            TASK_KEY_SCHEDULER,
            self.owner_token,
            self.owner_label,
            ttl_seconds,
            now=now,
        )
        self._scheduler_has_lease = lease.acquired
        if not lease.acquired and self._busy_log_allowed(TASK_KEY_SCHEDULER):
            LEASE_LOGGER.info(
                "lease_busy",
                extra={
                    "task_key": TASK_KEY_SCHEDULER,
                    "owner_token": self.owner_token,
                    "owner_label": self.owner_label,
                },
            )
        return lease.acquired

    def run(self):
        BOOTSTRAP_LOGGER.info(
            "bootstrap_started",
            extra={
                "owner_token": self.owner_token,
                "owner_label": self.owner_label,
            },
        )
        ensure_automation_task_states()
        while not self.stop_event.is_set():
            close_old_connections()
            try:
                self.run_cycle()
            except Exception:  # noqa: BLE001
                AUTOMATION_LOGGER.exception(
                    "runner_cycle_error",
                    extra={
                        "owner_token": self.owner_token,
                        "owner_label": self.owner_label,
                    },
                )
            finally:
                close_old_connections()
            self.stop_event.wait(getattr(settings, "INVENTORY_AUTOMATION_POLL_SECONDS", 60))

    def run_cycle(self):
        if not self._ensure_scheduler_lease():
            return

        if is_reconcile_due():
            self.run_reconcile_job()
        self.run_digest_job_if_due()

    def run_reconcile_job(self):
        now = timezone.now()
        job_owner_token = f"{TASK_KEY_MINIMUM_STOCK_RECONCILE}-{uuid.uuid4().hex}"
        job_owner_label = _runner_owner_label(f"{self.name}:{TASK_KEY_MINIMUM_STOCK_RECONCILE}")
        LEASE_LOGGER.info(
            "lease_acquire_attempt",
            extra={
                "task_key": TASK_KEY_MINIMUM_STOCK_RECONCILE,
                "owner_token": job_owner_token,
                "owner_label": job_owner_label,
            },
        )
        lease = try_acquire_lease(
            TASK_KEY_MINIMUM_STOCK_RECONCILE,
            job_owner_token,
            job_owner_label,
            getattr(settings, "INVENTORY_AUTOMATION_SCHEDULER_LEASE_SECONDS", 90),
            now=now,
        )
        if not lease.acquired:
            if self._busy_log_allowed(TASK_KEY_MINIMUM_STOCK_RECONCILE):
                LEASE_LOGGER.info(
                    "lease_busy",
                    extra={
                        "task_key": TASK_KEY_MINIMUM_STOCK_RECONCILE,
                        "owner_token": job_owner_token,
                        "owner_label": job_owner_label,
                    },
                )
            return

        from .services import evaluate_safety_stock_alert

        batch_size = getattr(settings, "INVENTORY_AUTOMATION_BATCH_SIZE", 100)
        heartbeat_seconds = getattr(settings, "INVENTORY_AUTOMATION_JOB_HEARTBEAT_SECONDS", 15)
        ttl_seconds = getattr(settings, "INVENTORY_AUTOMATION_SCHEDULER_LEASE_SECONDS", 90)
        processed_count = 0
        error_count = 0
        batch_number = 0
        last_seen_id = 0
        warning_message = ""
        batch_started_at = time.monotonic()

        RECONCILE_LOGGER.info(
            "reconcile_start",
            extra={
                "task_key": TASK_KEY_MINIMUM_STOCK_RECONCILE,
                "owner_token": job_owner_token,
                "owner_label": job_owner_label,
            },
        )

        try:
            while True:
                rules = list(
                    SafetyStockAlertRule.objects.select_related(
                        "article__primary_location",
                        "article__sector_responsible",
                    )
                    .filter(is_enabled=True, article_id__gt=last_seen_id)
                    .order_by("article_id")[:batch_size]
                )
                if not rules:
                    break

                batch_number += 1
                for rule in rules:
                    try:
                        evaluate_safety_stock_alert(rule.article)
                    except Exception as exc:  # noqa: BLE001
                        error_count += 1
                        RECONCILE_LOGGER.exception(
                            "reconcile_item_error",
                            extra={
                                "task_key": TASK_KEY_MINIMUM_STOCK_RECONCILE,
                                "owner_token": job_owner_token,
                                "article_id": rule.article_id,
                                "article_code": rule.article.internal_code,
                                "error_count": error_count,
                            },
                        )
                        warning_message = (
                            f"Se ignoraron {error_count} articulos con error durante la reconciliacion."
                        )
                    processed_count += 1
                    last_seen_id = rule.article_id
                    if time.monotonic() - batch_started_at >= heartbeat_seconds:
                        if not renew_lease(
                            TASK_KEY_MINIMUM_STOCK_RECONCILE,
                            job_owner_token,
                            ttl_seconds,
                            now=timezone.now(),
                        ):
                            return
                        if not renew_lease(
                            TASK_KEY_SCHEDULER,
                            self.owner_token,
                            ttl_seconds,
                            now=timezone.now(),
                        ):
                            self._scheduler_has_lease = False
                            return
                        batch_started_at = time.monotonic()

                if not renew_lease(
                    TASK_KEY_MINIMUM_STOCK_RECONCILE,
                    job_owner_token,
                    ttl_seconds,
                    now=timezone.now(),
                ):
                    return
                if not renew_lease(
                    TASK_KEY_SCHEDULER,
                    self.owner_token,
                    ttl_seconds,
                    now=timezone.now(),
                ):
                    self._scheduler_has_lease = False
                    return

                RECONCILE_LOGGER.info(
                    "reconcile_batch_progress",
                    extra={
                        "task_key": TASK_KEY_MINIMUM_STOCK_RECONCILE,
                        "owner_token": job_owner_token,
                        "processed_count": processed_count,
                        "error_count": error_count,
                        "last_article_id": last_seen_id,
                        "batch_number": batch_number,
                    },
                )

            outcome = (
                InventoryAutomationTaskState.LastRunStatus.WARNING
                if error_count
                else InventoryAutomationTaskState.LastRunStatus.SUCCESS
            )
            finish_task_run(
                TASK_KEY_MINIMUM_STOCK_RECONCILE,
                job_owner_token,
                outcome,
                now=timezone.now(),
                processed_count=processed_count,
                warning_message=warning_message,
            )
            RECONCILE_LOGGER.info(
                "reconcile_finish",
                extra={
                    "task_key": TASK_KEY_MINIMUM_STOCK_RECONCILE,
                    "owner_token": job_owner_token,
                    "processed_count": processed_count,
                    "error_count": error_count,
                },
            )
        except Exception as exc:  # noqa: BLE001
            finish_task_run(
                TASK_KEY_MINIMUM_STOCK_RECONCILE,
                job_owner_token,
                InventoryAutomationTaskState.LastRunStatus.ERROR,
                now=timezone.now(),
                processed_count=processed_count,
                error_message=str(exc),
                warning_message=warning_message,
            )
            RECONCILE_LOGGER.exception(
                "reconcile_error",
                extra={
                    "task_key": TASK_KEY_MINIMUM_STOCK_RECONCILE,
                    "owner_token": job_owner_token,
                    "processed_count": processed_count,
                },
            )

    def run_digest_job_if_due(self):
        config = MinimumStockDigestConfig.objects.filter(key="default").first()
        if not config or not config.is_enabled:
            return
        due_context = get_minimum_stock_digest_due_context(config)
        # Permite envío si es hora o si se forzó desde admin
        if not due_context["due"] and not config.force_send_next:
            return

        now = timezone.now()
        job_owner_token = f"{TASK_KEY_MINIMUM_STOCK_DIGEST}-{uuid.uuid4().hex}"
        job_owner_label = _runner_owner_label(f"{self.name}:{TASK_KEY_MINIMUM_STOCK_DIGEST}")
        LEASE_LOGGER.info(
            "lease_acquire_attempt",
            extra={
                "task_key": TASK_KEY_MINIMUM_STOCK_DIGEST,
                "owner_token": job_owner_token,
                "owner_label": job_owner_label,
            },
        )
        lease = try_acquire_lease(
            TASK_KEY_MINIMUM_STOCK_DIGEST,
            job_owner_token,
            job_owner_label,
            getattr(settings, "INVENTORY_AUTOMATION_DIGEST_LEASE_SECONDS", 300),
            now=now,
        )
        if not lease.acquired:
            if self._busy_log_allowed(TASK_KEY_MINIMUM_STOCK_DIGEST):
                LEASE_LOGGER.info(
                    "lease_busy",
                    extra={
                        "task_key": TASK_KEY_MINIMUM_STOCK_DIGEST,
                        "owner_token": job_owner_token,
                        "owner_label": job_owner_label,
                    },
                )
            return

        from .services import dispatch_minimum_stock_digest

        processed_count = 0
        try:
            config = MinimumStockDigestConfig.objects.prefetch_related(
                "recipients__profile__sector_default"
            ).filter(pk=config.pk).first()
            if not config or not config.is_enabled:
                finish_task_run(
                    TASK_KEY_MINIMUM_STOCK_DIGEST,
                    job_owner_token,
                    InventoryAutomationTaskState.LastRunStatus.SKIPPED,
                    now=timezone.now(),
                    processed_count=0,
                )
                return

            due_context = get_minimum_stock_digest_due_context(config)
            # Permite envío si es hora o si se forzó desde admin
            if not due_context["due"] and not config.force_send_next:
                finish_task_run(
                    TASK_KEY_MINIMUM_STOCK_DIGEST,
                    job_owner_token,
                    InventoryAutomationTaskState.LastRunStatus.SKIPPED,
                    now=timezone.now(),
                    processed_count=0,
                )
                return

            due_key = due_context["due_key"]
            DIGEST_LOGGER.info(
                "digest_due",
                extra={
                    "period_key": due_key,
                    "owner_token": job_owner_token,
                },
            )
            claimed, takeover = claim_minimum_stock_digest_period(config, due_key, now=timezone.now())
            if not claimed:
                finish_task_run(
                    TASK_KEY_MINIMUM_STOCK_DIGEST,
                    job_owner_token,
                    InventoryAutomationTaskState.LastRunStatus.SKIPPED,
                    now=timezone.now(),
                    processed_count=0,
                    warning_message="El periodo ya estaba consumido o en curso.",
                )
                return
            if takeover:
                DIGEST_LOGGER.warning(
                    "runner_recovered_after_takeover",
                    extra={
                        "period_key": due_key,
                        "owner_token": job_owner_token,
                    },
                )

            result = dispatch_minimum_stock_digest(config.pk, due_key)
            processed_count = result.get("summary_count") or 0
            if result["delivery_status"] == MinimumStockDigestConfig.DeliveryStatus.ERROR:
                finish_task_run(
                    TASK_KEY_MINIMUM_STOCK_DIGEST,
                    job_owner_token,
                    InventoryAutomationTaskState.LastRunStatus.ERROR,
                    now=timezone.now(),
                    processed_count=processed_count,
                    error_message=result.get("email_error", ""),
                    warning_message=result.get("recipient_warning", ""),
                )
                return

            outcome = InventoryAutomationTaskState.LastRunStatus.SUCCESS
            warning_message = result.get("recipient_warning", "")
            if result["delivery_status"] in {
                MinimumStockDigestConfig.DeliveryStatus.WARNING,
                MinimumStockDigestConfig.DeliveryStatus.SKIPPED,
            }:
                outcome = InventoryAutomationTaskState.LastRunStatus.WARNING
            finish_task_run(
                TASK_KEY_MINIMUM_STOCK_DIGEST,
                job_owner_token,
                outcome,
                now=timezone.now(),
                processed_count=processed_count,
                warning_message=warning_message,
            )
            
            # Resetea el flag de forzar envío si fue marcado desde admin
            if config.force_send_next:
                MinimumStockDigestConfig.objects.filter(pk=config.pk).update(force_send_next=False)
                DIGEST_LOGGER.info(
                    "force_send_flag_reset",
                    extra={"period_key": due_key},
                )
        except Exception as exc:  # noqa: BLE001
            finish_task_run(
                TASK_KEY_MINIMUM_STOCK_DIGEST,
                job_owner_token,
                InventoryAutomationTaskState.LastRunStatus.ERROR,
                now=timezone.now(),
                processed_count=processed_count,
                error_message=str(exc),
            )
            DIGEST_LOGGER.exception(
                "digest_unhandled_error",
                extra={
                    "task_key": TASK_KEY_MINIMUM_STOCK_DIGEST,
                    "owner_token": job_owner_token,
                },
            )


def maybe_start_inventory_automation():
    global _RUNNER_INSTANCE

    BOOTSTRAP_LOGGER.info(
        "bootstrap_start",
        extra={
            "argv": list(sys.argv),
            "run_main": os.environ.get("RUN_MAIN"),
            "debug": getattr(settings, "DEBUG", False),
        },
    )
    if not should_bootstrap_inventory_automation():
        BOOTSTRAP_LOGGER.info(
            "bootstrap_skip",
            extra={
                "argv": list(sys.argv),
                "run_main": os.environ.get("RUN_MAIN"),
            },
        )
        return None

    with _RUNNER_LOCK:
        if _RUNNER_INSTANCE and _RUNNER_INSTANCE.is_alive():
            BOOTSTRAP_LOGGER.info("bootstrap_already_running")
            return _RUNNER_INSTANCE
        
        BOOTSTRAP_LOGGER.info("bootstrap_starting_worker")
        _RUNNER_INSTANCE = InventoryAutomationRunner()
        _RUNNER_INSTANCE.start()
        BOOTSTRAP_LOGGER.info(
            "bootstrap_worker_started",
            extra={"worker_name": _RUNNER_INSTANCE.name},
        )
        return _RUNNER_INSTANCE


def reset_inventory_automation_runner_for_tests():
    global _RUNNER_INSTANCE
    with _RUNNER_LOCK:
        if _RUNNER_INSTANCE and _RUNNER_INSTANCE.is_alive():
            _RUNNER_INSTANCE.stop()
        _RUNNER_INSTANCE = None
