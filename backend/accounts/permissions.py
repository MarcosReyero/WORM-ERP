"""
Utilidades para verificar permisos de usuario en la plataforma.
"""
from functools import wraps
from django.http import JsonResponse
from django.core.exceptions import PermissionDenied
from .models import (
    UserModulePermission,
    RolePermission,
    SectorPermission,
    UserProfile,
)


def has_module_permission(user, module_code, action_code="view"):
    """
    Verifica si un usuario tiene permiso para realizar una acción en un módulo.

    Args:
        user: Usuario a verificar
        module_code: Código del módulo (ej: 'inventory_overview')
        action_code: Código de la acción (ej: 'view', 'create', etc.)

    Returns:
        bool: True si tiene permiso, False en caso contrario
    """
    # Superuser siempre tiene acceso total.
    # Los usuarios `is_staff` NO se tratan como bypass: la plataforma
    # usa `RolePermission`/`UserModulePermission` para controlar acceso.
    if user.is_superuser:
        return True

    if not user.is_active:
        return False

    # Intentar obtener permisos específicos del usuario
    try:
        user_permission = user.permissions
        if not user_permission.inherit_role_permissions:
            # Usuario solo tiene permisos específicos, buscar en UserModulePermission
            user_module_perms = UserModulePermission.objects.filter(
                user_permission=user_permission,
                module__code=module_code,
                allow=True,
            ).first()

            if user_module_perms:
                return user_module_perms.actions.filter(code=action_code).exists()
            return False
        else:
            # Usuario hereda permisos del rol + tiene permisos específicos
            # Primero revisar si hay negación específica
            denied = UserModulePermission.objects.filter(
                user_permission=user_permission,
                module__code=module_code,
                allow=False,
            ).first()

            if denied and denied.actions.filter(code=action_code).exists():
                return False

            # Luego revisar si hay permiso específico
            allowed = UserModulePermission.objects.filter(
                user_permission=user_permission,
                module__code=module_code,
                allow=True,
            ).first()

            if allowed and allowed.actions.filter(code=action_code).exists():
                return True

            # Finalmente, revisar el rol
            try:
                profile = user.profile
                role_perm = RolePermission.objects.filter(
                    role=profile.role, module__code=module_code
                ).first()

                if role_perm:
                    return role_perm.actions.filter(code=action_code).exists()
            except UserProfile.DoesNotExist:
                pass

            return False
    except Exception:
        # Si no hay permisos específicos, usar rol
        try:
            profile = user.profile
            role_perm = RolePermission.objects.filter(
                role=profile.role, module__code=module_code
            ).first()

            if role_perm:
                return role_perm.actions.filter(code=action_code).exists()
            return False
        except UserProfile.DoesNotExist:
            return False


def has_sector_permission(user, sector, action="view"):
    """
    Verifica si un usuario tiene permiso para acceder a un sector específico.

    Args:
        user: Usuario a verificar
        sector: Objeto Sector
        action: 'view', 'edit', 'delete'

    Returns:
        bool: True si tiene permiso
    """
    if user.is_superuser:
        return True

    sector_perm = SectorPermission.objects.filter(user=user, sector=sector).first()

    if not sector_perm:
        # Si no hay permiso específico y es administrador, permite todo
        try:
            if user.profile.role == UserProfile.Role.ADMINISTRATOR:
                return True
        except UserProfile.DoesNotExist:
            pass
        return False

    if action == "view":
        return sector_perm.can_view
    elif action == "edit":
        return sector_perm.can_edit
    elif action == "delete":
        return sector_perm.can_delete

    return False


def permission_required(module_code, action_code="view"):
    """
    Decorador para proteger vistas que requieren permisos específicos.

    Uso:
        @permission_required('inventory_overview', 'view')
        def my_view(request):
            ...
    """

    def decorator(view_func):
        """Maneja decorator."""
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            """Maneja wrapper."""
            if has_module_permission(request.user, module_code, action_code):
                return view_func(request, *args, **kwargs)

            if request.headers.get("Accept") == "application/json":
                return JsonResponse(
                    {
                        "error": "No tienes permiso para acceder a esta sección",
                        "code": "PERMISSION_DENIED",
                    },
                    status=403,
                )

            raise PermissionDenied(
                "No tienes permiso para acceder a esta sección"
            )

        return wrapper

    return decorator


def get_user_accessible_modules(user):
    """
    Retorna una lista de módulos accesibles para el usuario.

    Returns:
        dict: {module_code: {acciones_permitidas}}
    """
    from .models import PermissionModule

    accessible = {}

    try:
        profile = user.profile
        role_perms = RolePermission.objects.filter(role=profile.role).prefetch_related(
            "actions", "module"
        )

        for perm in role_perms:
            accessible[perm.module.code] = {
                "module": perm.module.name,
                "actions": [a.code for a in perm.actions.all()],
            }

        # Agregar permisos específicos del usuario
        if hasattr(user, "permissions"):
            user_perm = user.permissions
            user_module_perms = UserModulePermission.objects.filter(
                user_permission=user_perm
            ).prefetch_related("actions", "module")

            for perm in user_module_perms:
                if perm.allow:
                    if perm.module.code not in accessible:
                        accessible[perm.module.code] = {
                            "module": perm.module.name,
                            "actions": [],
                        }
                    existing_actions = accessible[perm.module.code]["actions"]
                    new_actions = [a.code for a in perm.actions.all()]
                    accessible[perm.module.code]["actions"] = list(
                        set(existing_actions + new_actions)
                    )
                else:
                    # Remover permisos denegados
                    if perm.module.code in accessible:
                        denied_actions = [a.code for a in perm.actions.all()]
                        accessible[perm.module.code]["actions"] = [
                            a
                            for a in accessible[perm.module.code]["actions"]
                            if a not in denied_actions
                        ]

    except UserProfile.DoesNotExist:
        pass

    return accessible


def get_user_accessible_sectors(user):
    """
    Retorna sectores accesibles para el usuario.

    Returns:
        queryset: Sectores a los que el usuario puede acceder
    """
    sector_perms = SectorPermission.objects.filter(
        user=user, can_view=True
    ).values_list("sector_id", flat=True)

    from inventory.models import Sector

    sectors = Sector.objects.filter(pk__in=sector_perms)

    # Si es administrador, retornar todos
    try:
        if user.profile.role == UserProfile.Role.ADMINISTRATOR:
            sectors = Sector.objects.all()
    except UserProfile.DoesNotExist:
        pass

    return sectors
