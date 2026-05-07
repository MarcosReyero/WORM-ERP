"""
Management command para ejecutar el scheduler de automatización de stock mínimo.

El comando arranca en un contenedor dedicado (inventory_automation) y:
1. Verifica que el schema esté listo (migraciones aplicadas)
2. Bootstrapea las filas de TaskState
3. Entra en loop scheduler que:
   - Cada 60s intenta adquirir lease de scheduler
   - Si lo logra: ejecuta jobs due (reconcile, digest)
   - Si falla: espera y reintenta

Uso:
    python manage.py run_inventory_automation
    python manage.py run_inventory_automation --poll-seconds 120
    python manage.py run_inventory_automation --wait-for-schema 60
"""

import logging
import os
import signal
import sys
import time
import traceback
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.utils import ProgrammingError, OperationalError
from django.conf import settings

logger = logging.getLogger("inventory.automation")


class Command(BaseCommand):
    help = "Ejecuta el scheduler de automatización de alarmas de stock mínimo."

    def add_arguments(self, parser):
        """Maneja add arguments."""
        parser.add_argument(
            "--poll-seconds",
            type=int,
            default=60,
            help="Intervalo de polling del scheduler en segundos (default 60)",
        )
        parser.add_argument(
            "--wait-for-schema",
            type=int,
            default=30,
            help="Segundos máximos a esperar que el schema esté listo (default 30)",
        )
        parser.add_argument(
            "--reconcile-interval",
            type=int,
            default=600,
            help="Intervalo de reconciliación en segundos (default 600 = 10 min)",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=100,
            help="Tamaño de batch para reconciliación (default 100)",
        )
        parser.add_argument(
            "--dev",
            action="store_true",
            help="Modo de desarrollo: logging verboso, sin validaciones estrictas",
        )

    def _verify_schema_ready(self, timeout_seconds):
        """
        Verifica que las tablas necesarias existan.
        Reintenta cada 5s hasta timeout.
        Retorna True si OK, False si timeout.
        """
        from django.db import connection as django_connection

        required_tables = [
            "inventory_inventoryautomationtaskstate",
            "inventory_minimumstockdigestconfig",
            "inventory_safetystockalertrule",
        ]

        start_time = time.time()

        while time.time() - start_time < timeout_seconds:
            try:
                with django_connection.cursor() as cursor:
                    existing_tables = django_connection.introspection.table_names()
                    missing = [t for t in required_tables if t not in existing_tables]

                    if not missing:
                        logger.info(
                            "schema_check_passed",
                            extra={"tables_verified": len(required_tables)},
                        )
                        return True

                    logger.warning(
                        "schema_check_incomplete",
                        extra={
                            "missing_tables": missing,
                            "retry_in_seconds": 5,
                        },
                    )
            except (ProgrammingError, OperationalError) as e:
                logger.warning(
                    "schema_check_db_error",
                    extra={"error": str(e), "retry_in_seconds": 5},
                )

            time.sleep(5)

        logger.error(
            "schema_check_timeout",
            extra={
                "timeout_seconds": timeout_seconds,
                "required_tables": required_tables,
            },
        )
        return False

    def _bootstrap_task_state(self):
        """Crea filas TaskState si no existen (idempotente)."""
        from inventory.models import InventoryAutomationTaskState
        from inventory.automation import AUTOMATION_TASK_KEYS

        for key in AUTOMATION_TASK_KEYS:
            obj, created = InventoryAutomationTaskState.objects.get_or_create(
                key=key,
                defaults={"runtime_state": InventoryAutomationTaskState.RuntimeState.IDLE},
            )
            if created:
                logger.debug(f"task_state_created key={key}")
            else:
                logger.debug(f"task_state_exists key={key}")

        logger.info(
            "bootstrap_task_state_complete",
            extra={"task_count": len(AUTOMATION_TASK_KEYS)},
        )

    def _check_automation_enabled(self, is_dev=False):
        """Verifica si la automatización está habilitada en settings."""
        if is_dev:
            # En modo dev, ignorar setting y asumir habilitado
            logger.info("dev_mode_enabled automation checks bypassed")
            return
        
        if not getattr(settings, "INVENTORY_AUTOMATION_ENABLED", True):
            raise CommandError(
                "Automatización deshabilitada: INVENTORY_AUTOMATION_ENABLED=False"
            )

    def handle(self, *args, **options):
        """Punto de entrada del comando."""
        is_dev = options.get("dev", False)
        
        # 1. Configura logging en modo desarrollo
        if is_dev:
            dev_logger = logging.getLogger("inventory.automation")
            dev_logger.setLevel(logging.DEBUG)
            console_handler = logging.StreamHandler()
            console_handler.setLevel(logging.DEBUG)
            formatter = logging.Formatter(
                "%(asctime)s [%(name)s] %(levelname)s: %(message)s"
            )
            console_handler.setFormatter(formatter)
            dev_logger.addHandler(console_handler)
        
        # 2. Verifica que automatización esté habilitada
        try:
            self._check_automation_enabled(is_dev=is_dev)
        except CommandError as e:
            self.stdout.write(self.style.ERROR(str(e)))
            raise

        # 3. Verifica schema
        wait_timeout = options["wait_for_schema"]
        if is_dev:
            self.stdout.write(
                self.style.SUCCESS(
                    f"🔧 MODO DESARROLLO - polling cada {options['poll_seconds']}s"
                )
            )
        
        logger.info(
            "automation_command_starting",
            extra={
                "wait_for_schema": wait_timeout,
                "poll_seconds": options["poll_seconds"],
                "dev_mode": is_dev,
            },
        )

        if not self._verify_schema_ready(wait_timeout):
            raise CommandError(
                f"Schema no está listo después de {wait_timeout}s. "
                "Asegúrate de que las migraciones se han ejecutado: "
                "python manage.py migrate"
            )

        # 4. Bootstrap task state
        try:
            self._bootstrap_task_state()
        except Exception as e:
            raise CommandError(f"Bootstrap fallido: {e}")

        # 5. Inicia runner
        from inventory.automation import InventoryAutomationRunner

        runner = InventoryAutomationRunner()

        # Configura handlers de señales para graceful shutdown
        def handle_signal(signum, frame):
            """Maneja signal."""
            logger.info(
                "automation_shutdown_signal",
                extra={"signum": signum},
            )
            runner.stop()

        signal.signal(signal.SIGTERM, handle_signal)
        signal.signal(signal.SIGINT, handle_signal)

        dev_msg = " (DEV MODE - presiona Ctrl+C)" if is_dev else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"✓ Scheduler iniciado{dev_msg}"
            )
        )

        try:
            runner.run()
        except KeyboardInterrupt:
            logger.info("automation_keyboard_interrupt")
            self.stdout.write(self.style.WARNING("Interrupción por usuario (Ctrl+C)"))
        except Exception as e:
            logger.error(
                "automation_runner_crashed",
                extra={"error": str(e), "traceback": traceback.format_exc()},
            )
            raise CommandError(f"Runner falló: {e}")
        finally:
            logger.info("automation_command_finished")
            self.stdout.write(self.style.SUCCESS("✓ Scheduler finalizado."))
