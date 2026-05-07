from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from .models import (
    UserProfile,
    PermissionModule,
    PermissionAction,
    RolePermission,
    UserPermission,
    UserModulePermission,
    SectorPermission,
)


class RolePermissionInline(admin.TabularInline):
    """Inline para gestionar permisos de roles"""
    model = RolePermission.actions.through
    extra = 0
    verbose_name = "Acción permitida"
    verbose_name_plural = "Acciones permitidas"


@admin.register(PermissionModule)
class PermissionModuleAdmin(admin.ModelAdmin):
    """Administrador de módulos de permisos"""
    list_display = ("code", "name", "description", "order")
    list_editable = ("order",)
    list_filter = ("order",)
    search_fields = ("code", "name", "description")
    ordering = ("order", "name")
    fieldsets = (
        ("Información Básica", {
            "fields": ("code", "name", "description", "order")
        }),
    )

    def has_delete_permission(self, request, obj=None):
        """Evitar eliminación de módulos"""
        return False


@admin.register(PermissionAction)
class PermissionActionAdmin(admin.ModelAdmin):
    """Administrador de acciones de permisos"""
    list_display = ("code", "name", "description")
    search_fields = ("code", "name")
    ordering = ("code",)

    def has_delete_permission(self, request, obj=None):
        """Evitar eliminación de acciones"""
        return False


class RolePermissionInlineForRole(admin.TabularInline):
    """Inline para editar permisos de múltiples módulos para un rol"""
    model = RolePermission
    extra = 0
    filter_horizontal = ("actions",)
    verbose_name = "Permiso de módulo"
    verbose_name_plural = "Permisos de módulos"

    def get_queryset(self, request):
        """Devuelve queryset."""
        qs = super().get_queryset(request)
        return qs.prefetch_related("actions", "module")


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    """Administrador central de permisos por rol"""
    list_display = ("role_display", "module", "actions_display", "created_at")
    list_filter = ("role", "module")
    search_fields = ("role",)
    filter_horizontal = ("actions",)
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "created_at"

    fieldsets = (
        ("Configuración", {
            "fields": ("role", "module", "actions")
        }),
        ("Metadata", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",)
        }),
    )

    def role_display(self, obj):
        """Mostrar rol con mejor formato"""
        return obj.get_role_display()
    role_display.short_description = "Rol"

    def actions_display(self, obj):
        """Mostrar acciones asignadas"""
        actions = obj.actions.values_list("name", flat=True)
        if not actions:
            return format_html('<span style="color: red;">Sin acciones</span>')
        return ", ".join(actions)
    actions_display.short_description = "Acciones permitidas"

    def get_queryset(self, request):
        """Devuelve queryset."""
        qs = super().get_queryset(request)
        return qs.prefetch_related("actions", "module")

    class Media:
        css = {
            "all": ("admin/css/admin-permissions.css",)
        }


class UserModulePermissionInline(admin.TabularInline):
    """Inline para editar permisos de módulo del usuario"""
    model = UserModulePermission
    extra = 0
    filter_horizontal = ("actions",)
    verbose_name = "Permiso de módulo específico"
    verbose_name_plural = "Permisos de módulos específicos"

    def get_queryset(self, request):
        """Devuelve queryset."""
        qs = super().get_queryset(request)
        return qs.prefetch_related("actions", "module")


@admin.register(UserPermission)
class UserPermissionAdmin(admin.ModelAdmin):
    """Administrador de permisos específicos de usuario"""
    list_display = ("username", "role_display", "inherit_display", "num_modules", "num_sectors")
    list_filter = ("inherit_role_permissions", "user__profile__role")
    search_fields = ("user__username", "user__first_name", "user__last_name")
    readonly_fields = ("created_at", "updated_at", "role_info")
    raw_id_fields = ("user",)
    date_hierarchy = "created_at"
    inlines = [UserModulePermissionInline]

    fieldsets = (
        ("Información del Usuario", {
            "fields": ("user", "role_info")
        }),
        ("Configuración de Permisos", {
            "fields": ("inherit_role_permissions",),
            "description": "Si está marcado, el usuario hereda todos los permisos de su rol. "
                         "Los permisos específicos se sumarán a los del rol."
        }),
        ("Metadata", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",)
        }),
    )

    def has_add_permission(self, request):
        """Se agregan automáticamente al crear usuario"""
        return False

    def has_delete_permission(self, request, obj=None):
        """No permitir eliminar permisos de usuario"""
        return False

    def username(self, obj):
        """Mostrar nombre de usuario"""
        return f"{obj.user.get_full_name()} ({obj.user.username})"
    username.short_description = "Usuario"

    def role_display(self, obj):
        """Mostrar rol del usuario"""
        try:
            return obj.user.profile.get_role_display()
        except:
            return "—"
    role_display.short_description = "Rol"

    def role_info(self, obj):
        """Información del rol actual"""
        try:
            role = obj.user.profile.get_role_display()
            status = obj.user.profile.get_status_display()
            return format_html(
                "<strong>Rol:</strong> {}<br/><strong>Estado:</strong> {}<br/>"
                "<p style='margin-top: 10px; font-size: 12px; color: #666;'>"
                "ⓘ Este usuario heredará los permisos del rol '{}'</p>",
                role, status, role
            )
        except:
            return "Información del usuario no disponible"
    role_info.short_description = "Información"

    def inherit_display(self, obj):
        """Mostrar estado de herencia de permisos"""
        if obj.inherit_role_permissions:
            return format_html(
                '<span style="color: green; font-weight: bold;">✓ Hereda del rol</span>'
            )
        return format_html(
            '<span style="color: orange; font-weight: bold;">✗ Solo permisos específicos</span>'
        )
    inherit_display.short_description = "Herencia"

    def num_modules(self, obj):
        """Contar módulos con permisos específicos"""
        return obj.module_permissions.count()
    num_modules.short_description = "Módulos personalizados"

    def num_sectors(self, obj):
        """Contar sectores con permisos específicos"""
        return obj.user.sector_permissions.count()
    num_sectors.short_description = "Sectores"

    def get_queryset(self, request):
        """Devuelve queryset."""
        qs = super().get_queryset(request)
        return qs.prefetch_related(
            "module_permissions__actions",
            "module_permissions__module",
            "user__profile"
        )


@admin.register(SectorPermission)
class SectorPermissionAdmin(admin.ModelAdmin):
    """Administrador de permisos de sector"""
    list_display = ("username", "sector", "permisos_display", "created_at")
    list_filter = ("can_view", "can_edit", "can_delete", "sector")
    search_fields = ("user__username", "user__first_name", "user__last_name", "sector__name")
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("user", "sector")
    date_hierarchy = "created_at"

    fieldsets = (
        ("Asignación", {
            "fields": ("user", "sector")
        }),
        ("Permisos", {
            "fields": ("can_view", "can_edit", "can_delete"),
            "description": "Selecciona qué acciones puede realizar el usuario en este sector"
        }),
        ("Metadata", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",)
        }),
    )

    def username(self, obj):
        """Mostrar usuario"""
        return f"{obj.user.get_full_name()} ({obj.user.username})"
    username.short_description = "Usuario"

    def permisos_display(self, obj):
        """Mostrar permisos de forma visual"""
        perms = []
        if obj.can_view:
            perms.append(format_html('<span style="color: green;">👁 Ver</span>'))
        if obj.can_edit:
            perms.append(format_html('<span style="color: #ff6600;">✏ Editar</span>'))
        if obj.can_delete:
            perms.append(format_html('<span style="color: red;">🗑 Eliminar</span>'))

        return mark_safe(" | ".join(perms)) if perms else format_html(
            '<span style="color: gray;">Sin permisos</span>'
        )
    permisos_display.short_description = "Permisos"

    def get_queryset(self, request):
        """Devuelve queryset."""
        qs = super().get_queryset(request)
        return qs.select_related("user", "sector")


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    """Administrador de perfiles de usuario mejorado"""
    list_display = ("user_info", "role", "status", "sector_default", "permissions_link", "last_access")
    list_filter = ("role", "status", "sector_default", "preferred_theme")
    search_fields = ("user__username", "user__first_name", "user__last_name")
    readonly_fields = ("permissions_summary",)
    raw_id_fields = ("user", "sector_default")
    fieldsets = (
        ("Información del Usuario", {
            "fields": ("user", "role", "status")
        }),
        ("Configuración", {
            "fields": ("sector_default", "phone", "avatar", "preferred_theme")
        }),
        ("Permisos Personalizados", {
            "fields": ("permissions_summary",),
            "classes": ("collapse",),
            "description": "Para gestionar permisos específicos de este usuario, "
                          "ve a la sección de 'Permisos de Usuarios'"
        }),
        ("Metadata", {
            "fields": ("last_access",),
            "classes": ("collapse",)
        }),
    )

    def user_info(self, obj):
        """Mostrar información del usuario"""
        return f"{obj.user.get_full_name()} ({obj.user.username})"
    user_info.short_description = "Usuario"

    def permissions_link(self, obj):
        """Link para editar permisos del usuario"""
        try:
            user_perm = obj.user.permissions
            url = reverse("admin:accounts_userpermission_change", args=[user_perm.pk])
            return format_html(
                '<a class="button" href="{}">Ver Permisos</a>',
                url
            )
        except:
            return format_html('<span style="color: gray;">Sin permisos configurados</span>')
    permissions_link.short_description = "Permisos"

    def permissions_summary(self, obj):
        """Resumen de permisos del usuario"""
        try:
            user_perm = obj.user.permissions
            inherit_text = "heredará" if user_perm.inherit_role_permissions else "no heredará"
            modules = user_perm.module_permissions.count()
            sectors = obj.user.sector_permissions.count()

            return format_html(
                "<strong>Estado:</strong> El usuario {} los permisos de su rol<br/>"
                "<strong>Módulos personalizados:</strong> {}<br/>"
                "<strong>Sectores:</strong> {}<br/>"
                "<em style='color: #666; font-size: 12px;'>Haz clic en 'Ver Permisos' para editar</em>",
                inherit_text, modules or "—", sectors or "—"
            )
        except:
            return format_html(
                '<span style="color: orange;">⚠ Permisos no inicializados. '
                'Guarda el usuario primero.</span>'
            )
    permissions_summary.short_description = "Resumen de Permisos"

    def has_delete_permission(self, request, obj=None):
        """Permitir eliminación de perfiles"""
        return True

    def save_model(self, request, obj, form, change):
        """Al crear un UserProfile, crear también UserPermission"""
        super().save_model(request, obj, form, change)

        # Crear UserPermission si no existe
        UserPermission.objects.get_or_create(user=obj.user)

    def get_queryset(self, request):
        """Devuelve queryset."""
        qs = super().get_queryset(request)
        return qs.select_related("user", "sector_default")


# Mostrar información adicional en el admin
admin.site.site_header = "Panel de Administración - Inventario"
admin.site.site_title = "Admin Inventario"
admin.site.index_title = "Bienvenido al Panel de Control"
