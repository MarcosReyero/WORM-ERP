"""
Management command para inicializar la configuración del digest.
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from inventory.models import MinimumStockDigestConfig


class Command(BaseCommand):
    help = "Inicializa la configuración default del digest"

    def handle(self, *args, **options):
        """Maneja handle."""
        User = get_user_model()

        # Crear la configuración default si no existe
        config, created = MinimumStockDigestConfig.objects.get_or_create(
            key="default",
            defaults={
                "is_enabled": True,
                "frequency": "daily",
                "force_send_next": False,
            }
        )

        # Agregar destinatarios (usuarios del sistema)
        users = User.objects.all()
        config.recipients.set(users)

        self.stdout.write(self.style.SUCCESS(f"✓ Config creada: {created}"))
        self.stdout.write(self.style.SUCCESS(f"✓ Config key: {config.key}"))
        self.stdout.write(self.style.SUCCESS(f"✓ Destinatarios: {config.recipients.count()}"))
        self.stdout.write(self.style.SUCCESS(f"✓ Habilitado: {config.is_enabled}"))
