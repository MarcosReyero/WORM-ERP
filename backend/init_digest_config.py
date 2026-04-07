import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from inventory.models import MinimumStockDigestConfig
from django.contrib.auth import get_user_model

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

print(f"✓ Config creada: {created}")
print(f"✓ Config key: {config.key}")
print(f"✓ Destinatarios: {config.recipients.count()}")
print(f"✓ Habilitado: {config.is_enabled}")
