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
    telegram_chat_id = models.CharField(max_length=64, blank=True)
    preferred_theme = models.CharField(
        max_length=16,
        choices=PreferredTheme.choices,
        default=PreferredTheme.LIGHT,
    )
    last_access = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["user__username"]

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        return f"{self.user.username} ({self.get_role_display()})"


class PermissionModule(models.Model):
    """Módulos/secciones de la plataforma que pueden requerir permisos"""

    class Module(models.TextChoices):
        INVENTORY_OVERVIEW = "inventory_overview", "Panel de Inventario"
        STOCK_MANAGEMENT = "stock_management", "Gestión de Stock"
        MOVEMENTS = "movements", "Movimientos"
        CHECKOUTS = "checkouts", "Retiros"
        ALARMS = "alarms", "Alarmas"
        COUNTS = "counts", "Conteos"
        DISCREPANCIES = "discrepancies", "Discrepancias"
        ADMIN_USERS = "admin_users", "Administración de Usuarios"
        PERSONAL = "personal", "Personal"
        TIA = "tia", "TIA"
        PURCHASING = "purchasing", "Compras"
        REPORTS = "reports", "Reportes"
        SETTINGS = "settings", "Configuración"
        DEPOSITS_OVERVIEW = "deposits_overview", "Panel de Depósitos"
        PALLET_REGISTRY = "pallet_registry", "Registro de Pallets"
        DEPOSIT_LAYOUT = "deposit_layout", "Plano de Depósitos"
        PALLET_SCANS = "pallet_scans", "Escaneo de Pallets"

    code = models.CharField(
        max_length=50,
        choices=Module.choices,
        unique=True,
        primary_key=True,
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "Módulo de Permiso"
        verbose_name_plural = "Módulos de Permisos"

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        return self.name


class PermissionAction(models.Model):
    """Acciones que se pueden realizar dentro de un módulo"""

    class Action(models.TextChoices):
        VIEW = "view", "Ver"
        CREATE = "create", "Crear"
        CHANGE = "change", "Editar"
        DELETE = "delete", "Eliminar"
        EXPORT = "export", "Exportar"
        APPROVE = "approve", "Aprobar"

    code = models.CharField(
        max_length=50,
        choices=Action.choices,
        unique=True,
        primary_key=True,
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["code"]
        verbose_name = "Acción de Permiso"
        verbose_name_plural = "Acciones de Permisos"

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        return self.name


class RolePermission(models.Model):
    """Permisos asignados a cada rol (grupo)"""

    role = models.CharField(
        max_length=32,
        choices=UserProfile.Role.choices,
    )
    module = models.ForeignKey(
        PermissionModule,
        on_delete=models.CASCADE,
        related_name="role_permissions",
    )
    actions = models.ManyToManyField(
        PermissionAction,
        related_name="role_permissions",
        help_text="Acciones permitidas en este módulo",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("role", "module")
        verbose_name = "Permiso de Rol"
        verbose_name_plural = "Permisos de Roles"
        ordering = ["role", "module"]

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        return f"{self.get_role_display()} - {self.module.name}"

    def get_role_display(self):
        """Devuelve role display."""
        return dict(UserProfile.Role.choices).get(self.role, self.role)


class UserPermission(models.Model):
    """Permisos específicos por usuario que pueden sobrescribir los del rol"""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="permissions",
    )
    inherit_role_permissions = models.BooleanField(
        default=True,
        help_text="Si está marcado, hereda todos los permisos de su rol. "
        "Los permisos específicos se suman a los del rol.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Permiso de Usuario"
        verbose_name_plural = "Permisos de Usuarios"

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        return f"Permisos de {self.user.username}"


class UserModulePermission(models.Model):
    """Permisos específicos de usuario por módulo"""

    user_permission = models.ForeignKey(
        UserPermission,
        on_delete=models.CASCADE,
        related_name="module_permissions",
    )
    module = models.ForeignKey(
        PermissionModule,
        on_delete=models.CASCADE,
        related_name="user_module_permissions",
    )
    actions = models.ManyToManyField(
        PermissionAction,
        related_name="user_module_permissions",
        help_text="Acciones permitidas para este usuario en este módulo",
    )
    allow = models.BooleanField(
        default=True,
        help_text="Si está marcado, permite estas acciones. "
        "Si no, las deniega (sobrescribe permiso del rol)",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user_permission", "module")
        verbose_name = "Permiso de Módulo del Usuario"
        verbose_name_plural = "Permisos de Módulos del Usuario"
        ordering = ["user_permission", "module"]

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        action = "Permite" if self.allow else "Deniega"
        return f"{self.user_permission.user.username} - {self.module.name} - {action}"


class SectorPermission(models.Model):
    """Permisos de acceso a sectores específicos"""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sector_permissions",
    )
    sector = models.ForeignKey(
        "inventory.Sector",
        on_delete=models.CASCADE,
        related_name="user_permissions",
    )
    can_view = models.BooleanField(default=True)
    can_edit = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "sector")
        verbose_name = "Permiso de Sector"
        verbose_name_plural = "Permisos de Sectores"
        ordering = ["user", "sector"]

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        return f"{self.user.username} - {self.sector.name}"
