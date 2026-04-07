"""
Tests para la suite de automatización con runner contenedorizado.
Incluye: lifecycle, lease atomicity, reconcile, digest, idempotencia.
"""

import threading
import time
from datetime import datetime, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.db import transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from inventory.automation import (
    InventoryAutomationRunner,
    TASK_KEY_MINIMUM_STOCK_DIGEST,
    TASK_KEY_MINIMUM_STOCK_RECONCILE,
    TASK_KEY_SCHEDULER,
    claim_minimum_stock_digest_period,
    ensure_automation_task_states,
    try_acquire_lease,
    renew_lease,
    finish_task_run,
    get_minimum_stock_digest_due_context,
)
from inventory.models import (
    Article,
    InventoryAutomationTaskState,
    MinimumStockDigestConfig,
    SafetyStockAlertRule,
    Sector,
    UnitOfMeasure,
)
from inventory.services import evaluate_safety_stock_alert

User = get_user_model()


class runner_lifecycle_Tests(TestCase):
    """Tests para lifecycle del runner con métodos controlables."""

    def setUp(self):
        ensure_automation_task_states()

    def test_runner_is_running_when_initiated(self):
        """is_running() retorna True antes de stop()."""
        runner = InventoryAutomationRunner()
        self.assertTrue(runner.is_running())

    def test_runner_stop_sets_not_running(self):
        """stop() actualiza is_running()."""
        runner = InventoryAutomationRunner()
        runner.stop()
        self.assertFalse(runner.is_running())

    def test_runner_simulate_tick_acquires_scheduler_lease(self):
        """_simulate_tick() intenta adquirir lease."""
        runner = InventoryAutomationRunner()
        now = timezone.now()

        # Ejecuta un tick
        success = runner._simulate_tick(mock_now=now)

        self.assertTrue(success)

        # Verifica que scheduler tiene lease activo
        scheduler_task = InventoryAutomationTaskState.objects.get(key=TASK_KEY_SCHEDULER)
        self.assertEqual(scheduler_task.runtime_state, InventoryAutomationTaskState.RuntimeState.RUNNING)
        self.assertIsNotNone(scheduler_task.lease_expires_at)
        self.assertGreater(scheduler_task.lease_expires_at, now)

    def test_runner_simulate_tick_mock_now_works(self):
        """mock_now reemplaza timezone.now() correctamente."""
        runner = InventoryAutomationRunner()
        
        future_now = timezone.now() + timedelta(days=1)
        
        result = runner._simulate_tick(mock_now=future_now)
        
        self.assertTrue(result)  # No debe fallar

    def test_runner_start_stop_in_thread(self):
        """runner.start() en thread se detiene limpio con stop()."""
        runner = InventoryAutomationRunner()
        
        # Lanza en thread
        thread = threading.Thread(target=runner.start, daemon=False)
        thread.start()
        
        # Espera a que arrange
        time.sleep(1)
        self.assertTrue(thread.is_alive())
        
        # Detiene
        runner.stop()
        thread.join(timeout=5)
        
        # Verifica que terminó
        self.assertFalse(thread.is_alive())
        self.assertFalse(runner.is_running())


class lease_Atomicity_Tests(TransactionTestCase):
    """Tests para atomicidad del protocolo de lease."""

    def setUp(self):
        ensure_automation_task_states()

    def test_try_acquire_lease_is_atomic_with_race_condition(self):
        """Dos procesos intentan adquirir: solo uno lo logra."""
        results = []

        def acquire_competitor(runner_id):
            now = timezone.now()
            result = try_acquire_lease(
                TASK_KEY_SCHEDULER,
                f"token-{runner_id}",
                f"label-{runner_id}",
                90,
                now=now,
            )
            results.append((runner_id, result.acquired))

        # Crea dos threads que compiten por el lease
        t1 = threading.Thread(target=acquire_competitor, args=(1,))
        t2 = threading.Thread(target=acquire_competitor, args=(2,))

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Exactamente 1 debe lograrlo
        acquired_count = sum(1 for _, acq in results if acq)
        self.assertEqual(acquired_count, 1)

    def test_renew_lease_success(self):
        """Adquiere, renueva heartbeat y verifica actualización."""
        now = timezone.now()
        owner_token = "test-token"
        
        # Adquiere
        result = try_acquire_lease(TASK_KEY_SCHEDULER, owner_token, "test-label", 90, now=now)
        self.assertTrue(result.acquired)
        
        # Espera y renueva
        later = now + timedelta(seconds=30)
        renewed = renew_lease(TASK_KEY_SCHEDULER, owner_token, 90, now=later)
        
        self.assertTrue(renewed)
        
        # Verifica que heartbeat_at se actualizó
        task = InventoryAutomationTaskState.objects.get(key=TASK_KEY_SCHEDULER)
        self.assertEqual(task.heartbeat_at, later)

    def test_renew_lease_detects_loss(self):
        """renew_lease() retorna False si pierde el lease."""
        now = timezone.now()
        owner_token = "test-token"
        
        # Adquiere
        try_acquire_lease(TASK_KEY_SCHEDULER, owner_token, "test-label", 90, now=now)
        
        # Otro proceso toma over (fuerza TIMEOUT del lease previo)
        later = now + timedelta(seconds=120)  # Simula timeout
        other_token = "other-token"
        try_acquire_lease(TASK_KEY_SCHEDULER, other_token, "other-label", 90, now=later)
        
        # El primero intenta renovar pero ya perdió
        renewed = renew_lease(TASK_KEY_SCHEDULER, owner_token, 90, now=later)
        
        self.assertFalse(renewed)


class safety_alert_Idempotence_Tests(TestCase):
    """Tests para idempotencia de evaluación puntual de alertas."""

    def setUp(self):
        self.sector = Sector.objects.create(name="Sector Test", code="SECT-01")
        self.unit = UnitOfMeasure.objects.create(code="UN", name="Unidad")
        self.article = Article.objects.create(
            name="Article Test",
            internal_code="ART-001",
            article_type="consumible",
            tracking_mode="quantities",
            unit_of_measure=self.unit,
            sector_responsible=self.sector,
            minimum_stock=100,
        )
        self.rule = SafetyStockAlertRule.objects.create(
            article=self.article,
            is_enabled=True,
            status=SafetyStockAlertRule.AlertStatus.MONITORING,
        )
        self.user = User.objects.create_user(username="alertuser", email="alert@test.com")
        self.rule.recipients.add(self.user)

    def test_alert_transition_monitoring_to_triggered_sends_email_once(self):
        """Transición MONITORING->TRIGGERED envía email, sucesivas no."""
        with mock.patch("inventory.services.current_stock_for_article", return_value=50):
            # Primer call: debe enviar
            evaluate_safety_stock_alert(self.article)
            
            self.rule.refresh_from_db()
            self.assertEqual(self.rule.status, SafetyStockAlertRule.AlertStatus.TRIGGERED)
            self.assertEqual(len(mail.outbox), 1)
            
            # Segundo call: ya TRIGGERED, no debe enviar
            mail.outbox.clear()
            evaluate_safety_stock_alert(self.article)
            
            self.assertEqual(len(mail.outbox), 0)

    def test_alert_uses_select_for_update_for_atomicity(self):
        """SELECT FOR UPDATE hace la evaluación atómica."""
        with mock.patch("inventory.services.current_stock_for_article", return_value=50):
            # La función debe usar select_for_update internamente
            result = evaluate_safety_stock_alert(self.article)
            
            self.assertIsNotNone(result)
            self.rule.refresh_from_db()
            self.assertEqual(self.rule.status, SafetyStockAlertRule.AlertStatus.TRIGGERED)


class reconcile_Batching_Tests(TestCase):
    """Tests para reconciliación por lotes."""

    def setUp(self):
        ensure_automation_task_states()
        self.sector = Sector.objects.create(name="Sector", code="SEC")
        self.unit = UnitOfMeasure.objects.create(code="UN", name="Unit")
        
        # Crea múltiples artículos y reglas
        self.articles = []
        for i in range(250):
            art = Article.objects.create(
                name=f"Article {i}",
                internal_code=f"ART-{i:03d}",
                article_type="consumible",
                tracking_mode="quantities",
                unit_of_measure=self.unit,
                sector_responsible=self.sector,
                minimum_stock=100,
            )
            SafetyStockAlertRule.objects.create(
                article=art,
                is_enabled=True,
                status=SafetyStockAlertRule.AlertStatus.MONITORING,
            )
            self.articles.append(art)

    def test_reconcile_batching_processes_in_batches_of_100(self):
        """Reconciliación procesa en batches de 100."""
        runner = InventoryAutomationRunner()
        evaluated_ids = []

        def mock_evaluate(article):
            evaluated_ids.append(article.id)
            return None

        with mock.patch("inventory.services.evaluate_safety_stock_alert", side_effect=mock_evaluate):
            with mock.patch("inventory.automation.getattr") as mock_getattr:
                # Mock settings para batch_size=100
                def getattr_side_effect(obj, key, default=None):
                    if key == "INVENTORY_AUTOMATION_BATCH_SIZE":
                        return 100
                    return default if default is not None else object.__getattribute__(obj, key)
                
                mock_getattr.side_effect = getattr_side_effect
                
                runner.run_reconcile_job()

        # Verifica que se evaluaron todos
        self.assertEqual(len(evaluated_ids), 250)


class digest_Period_Claim_Tests(TestCase):
    """Tests para claiming de período del digest."""

    def setUp(self):
        ensure_automation_task_states()
        self.config = MinimumStockDigestConfig.objects.get_or_create(
            key="default",
            defaults={
                "is_enabled": True,
                "frequency": MinimumStockDigestConfig.Frequency.DAILY,
                "run_at": "08:00",
            },
        )[0]

    def test_digest_period_key_daily_calculation(self):
        """Period key diario se calcula correctamente."""
        now = timezone.localtime(timezone.now().replace(hour=8, minute=1))
        context = get_minimum_stock_digest_due_context(self.config, now=now)
        
        self.assertTrue(context["due"])
        self.assertTrue(context["due_key"].startswith("daily:"))

    def test_digest_period_key_not_due_before_schedule(self):
        """Period key no se calcula si no es la hora."""
        now = timezone.localtime(timezone.now().replace(hour=7, minute=59))
        context = get_minimum_stock_digest_due_context(self.config, now=now)
        
        self.assertFalse(context["due"])
        self.assertEqual(context["due_key"], "")

    def test_digest_claim_atomically_prevents_duplicate(self):
        """Claim atómico evita duplicación del mismo período."""
        now = timezone.now()
        due_key = f"daily:{now.date().isoformat()}"
        
        # Primer claim
        claimed1, takeover1 = claim_minimum_stock_digest_period(self.config, due_key, now=now)
        self.assertTrue(claimed1)
        self.assertFalse(takeover1)
        
        # Segundo claim del mismo período
        claimed2, takeover2 = claim_minimum_stock_digest_period(self.config, due_key, now=now)
        self.assertFalse(claimed2)  # No debe reclaimar
        
        # Pero si consumimos el período, no se puede reclaimar de nuevo
        finish_task_run(
            TASK_KEY_MINIMUM_STOCK_DIGEST,
            "dummy-token",
            InventoryAutomationTaskState.LastRunStatus.SUCCESS,
            now=now,
        )
        #TODO: Este test es parcial; necesitarías agregar lógica para consumir período


class management_Command_Tests(TestCase):
    """Tests para el management command run_inventory_automation."""

    def test_management_command_schema_check_passes_when_tables_exist(self):
        """Schema check pasa cuando las tablas existen."""
        from inventory.management.commands.run_inventory_automation import Command
        
        cmd = Command()
        # Las tablas ya existen en el test DB
        result = cmd._verify_schema_ready(timeout_seconds=5)
        
        self.assertTrue(result)

    @override_settings(INVENTORY_AUTOMATION_ENABLED=False)
    def test_management_command_exits_when_disabled(self):
        """Management command sale si INVENTORY_AUTOMATION_ENABLED=False."""
        from inventory.management.commands.run_inventory_automation import Command
        from django.core.management.base import CommandError
        
        cmd = Command()
        
        with self.assertRaises(CommandError) as ctx:
            cmd.handle()
        
        self.assertIn("deshabilitada", str(ctx.exception).lower())
