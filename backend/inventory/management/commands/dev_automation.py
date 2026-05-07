"""
Alias conveniente para ejecutar la automatización en desarrollo.

Uso:
    python manage.py dev-automation
    python manage.py dev-automation --poll-seconds 30
    python manage.py dev-automation --reconcile-interval 300
"""

from inventory.management.commands.run_inventory_automation import Command as BaseCommand


class Command(BaseCommand):
    help = "Atajo: ejecuta la automatización en modo desarrollo (equivalente a --dev)"

    def add_arguments(self, parser):
        """Maneja add arguments."""
        super().add_arguments(parser)
        # El flag --dev viene del command base
        # Solo ajustamos defaults para modo dev
        parser.set_defaults(
            poll_seconds=60,
            reconcile_interval=600,
            batch_size=100,
            wait_for_schema=10,  # Más rápido en dev
            dev=True,  # SIEMPRE modo dev
        )

    def handle(self, *args, **options):
        # Asegurar que dev siempre es True
        """Maneja handle."""
        options["dev"] = True
        
        # Opcional: imprimir mensaje amigable
        self.stdout.write(
            self.style.SUCCESS("🔧 Modo Desarrollo activado automáticamente")
        )
        
        # Delegar al command base
        super().handle(*args, **options)
