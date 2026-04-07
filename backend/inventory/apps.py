from django.apps import AppConfig
import logging

logger = logging.getLogger("inventory.automation")


class InventoryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "inventory"

    def ready(self):
        from .automation import maybe_start_inventory_automation
        
        # En modo dev, mostrar mensaje de que se va a iniciar el worker
        from django.conf import settings
        if getattr(settings, "DEBUG", False):
            logger.info("🤖 Inicializando Automation Worker (DEV MODE)")
        
        maybe_start_inventory_automation()
