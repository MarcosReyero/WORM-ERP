from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models


class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMINISTRATOR = "administrator", "Administrador"
        STOREKEEPER = "storekeeper", "Deposito / Panolero"
        SUPERVISOR = "supervisor", "Supervisor"
        OPERATOR = "operator", "Operario"
        MAINTENANCE = "maintenance", "Mantenimiento"
        PURCHASING = "purchasing", "Compras"
        AUDITOR = "auditor", "Auditor / Consulta"

    class Status(models.TextChoices):
        ACTIVE = "active", "Activo"
        INACTIVE = "inactive", "Inactivo"

    class PreferredTheme(models.TextChoices):
        LIGHT = "light", "Claro"
        DARK = "dark", "Oscuro"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    role = models.CharField(
        max_length=32,
        choices=Role.choices,
        default=Role.OPERATOR,
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    sector_default = models.ForeignKey(
        "inventory.Sector",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="default_profiles",
    )
    avatar = models.FileField(
        upload_to="profile-avatars/",
        null=True,
        blank=True,
        validators=[FileExtensionValidator(["jpg", "jpeg", "png", "webp", "gif"])],
    )
    phone = models.CharField(max_length=40, blank=True)
    preferred_theme = models.CharField(
        max_length=16,
        choices=PreferredTheme.choices,
        default=PreferredTheme.LIGHT,
    )
    last_access = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["user__username"]

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"
