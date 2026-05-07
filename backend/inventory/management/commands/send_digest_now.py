"""
Management command para forzar el envío del digest de stock mínimo.
Útil para testing en desarrollo.

Uso:
    python manage.py send_digest_now
"""

import uuid
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction

from inventory.models import MinimumStockDigestConfig, InventoryAutomationTaskState
from inventory.automation import (
    get_minimum_stock_digest_due_context,
    TASK_KEY_MINIMUM_STOCK_DIGEST,
    _runner_owner_label,
)
from inventory.services import dispatch_minimum_stock_digest


class Command(BaseCommand):
    help = "Fuerza el envío del digest de stock mínimo ahora"

    def handle(self, *args, **options):
        """Maneja handle."""
        self.stdout.write(self.style.SUCCESS("🚀 Enviando digest de stock mínimo..."))
        
        try:
            with transaction.atomic():
                # Obtiene la configuración del digest
                config = MinimumStockDigestConfig.objects.filter(key="default").first()
                if not config:
                    self.stdout.write(
                        self.style.ERROR("❌ No existe configuración de digest")
                    )
                    return
                
                # Obtiene el contexto de "due" para calcular la due_key
                due_context = get_minimum_stock_digest_due_context(config)
                due_key = due_context.get("due_key", "")
                
                if not due_key:
                    self.stdout.write(
                        self.style.WARNING(
                            "⚠️  No es la hora configurada del digest. "
                            f"Próximo envío: {due_context['next_run_at']}"
                        )
                    )
                    # Resetea de todas formas para permitir envío forzado
                    config.last_period_key = ""
                    config.inflight_period_key = ""
                    config.save()
                    self.stdout.write(
                        self.style.WARNING("✓ Configuración resetada para permitir envío forzado")
                    )
                
                # Resetea los controles para permitir nuevo envío
                self.stdout.write(
                    self.style.WARNING("⏳ Resetando controles de envío anterior...")
                )
                config.last_period_key = ""
                config.inflight_period_key = ""
                config.last_delivery_status = ""
                config.save()
                
                # Llama directamente al servicio de envío
                self.stdout.write(
                    self.style.WARNING(f"📧 Enviando digest con due_key: {due_key}...")
                )
                
                result = dispatch_minimum_stock_digest(config.pk, due_key)
                
                if result.get("delivery_status") == MinimumStockDigestConfig.DeliveryStatus.SUCCESS:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"✅ Digest enviado exitosamente ({result.get('summary_count')} artículos)"
                        )
                    )
                elif result.get("delivery_status") == MinimumStockDigestConfig.DeliveryStatus.SKIPPED:
                    self.stdout.write(
                        self.style.WARNING(
                            "⚠️  Digest skipped (probablemente no hay artículos en stock mínimo o está deshabilitado)"
                        )
                    )
                else:
                    self.stdout.write(
                        self.style.ERROR(
                            f"❌ Error enviando digest: {result.get('email_error')}"
                        )
                    )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ Error: {e}")
            )
            import traceback
            self.stdout.write(self.style.ERROR(traceback.format_exc()))
            raise
