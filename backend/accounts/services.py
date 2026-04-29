from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404

from communications.services import (
    user_open_alarm_count,
    user_unread_message_count,
)

from .models import (
    PermissionAction,
    PermissionModule,
    RolePermission,
    SectorPermission,
    UserModulePermission,
    UserPermission,
    UserProfile,
)

DEFAULT_PERMISSION_MODULES = [
    {
        "code": PermissionModule.Module.INVENTORY_OVERVIEW,
        "name": "Panel de Inventario",
        "description": "Vista general del estado del inventario",
        "order": 1,
    },
    {
        "code": PermissionModule.Module.STOCK_MANAGEMENT,
        "name": "Gestión de Stock",
        "description": "Administración de artículos y stock",
        "order": 2,
    },
    {
        "code": PermissionModule.Module.MOVEMENTS,
        "name": "Movimientos",
        "description": "Registro de entradas y salidas de inventario",
        "order": 3,
    },
    {
        "code": PermissionModule.Module.CHECKOUTS,
        "name": "Retiros",
        "description": "Gestión de retiros y entregas",
        "order": 4,
    },
    {
        "code": PermissionModule.Module.ALARMS,
        "name": "Alarmas",
        "description": "Sistema de alertas de stock bajo",
        "order": 5,
    },
    {
        "code": PermissionModule.Module.COUNTS,
        "name": "Conteos",
        "description": "Gestión de conteos y auditorías de stock",
        "order": 6,
    },
    {
        "code": PermissionModule.Module.DISCREPANCIES,
        "name": "Discrepancias",
        "description": "Identificación y resolución de discrepancias",
        "order": 7,
    },
    {
        "code": PermissionModule.Module.ADMIN_USERS,
        "name": "Administración de Usuarios",
        "description": "Gestión de usuarios y permisos",
        "order": 8,
    },
    {
        "code": PermissionModule.Module.PERSONAL,
        "name": "Personal",
        "description": "Informes personales e intercambio de Excel",
        "order": 9,
    },
    {
        "code": PermissionModule.Module.TIA,
        "name": "TIA",
        "description": "Integración Siemens S7-300 y monitoreo industrial",
        "order": 10,
    },
    {
        "code": PermissionModule.Module.PURCHASING,
        "name": "Compras",
        "description": "Solicitudes internas y seguimiento de compras",
        "order": 11,
    },
    {
        "code": PermissionModule.Module.REPORTS,
        "name": "Reportes",
        "description": "Generación y visualización de reportes",
        "order": 12,
    },
    {
        "code": PermissionModule.Module.SETTINGS,
        "name": "Configuración",
        "description": "Configuración del sistema",
        "order": 13,
    },
    {
        "code": PermissionModule.Module.DEPOSITS_OVERVIEW,
        "name": "Panel de Depósitos",
        "description": "Vista general del módulo Depósitos",
        "order": 14,
    },
    {
        "code": PermissionModule.Module.PALLET_REGISTRY,
        "name": "Registro de Pallets",
        "description": "Alta, consulta y mantenimiento de pallets",
        "order": 15,
    },
    {
        "code": PermissionModule.Module.DEPOSIT_LAYOUT,
        "name": "Plano de Depósitos",
        "description": "Visualización y gestión del plano físico",
        "order": 16,
    },
    {
        "code": PermissionModule.Module.PALLET_SCANS,
        "name": "Escaneo de Pallets",
        "description": "Escaneo QR, lookup y reubicaciones",
        "order": 17,
    },
]

DEFAULT_PERMISSION_ACTIONS = [
    {
        "code": PermissionAction.Action.VIEW,
        "name": "Ver",
        "description": "Permite visualizar",
    },
    {
        "code": PermissionAction.Action.CREATE,
        "name": "Crear",
        "description": "Permite crear nuevos registros",
    },
    {
        "code": PermissionAction.Action.CHANGE,
        "name": "Editar",
        "description": "Permite editar registros existentes",
    },
    {
        "code": PermissionAction.Action.DELETE,
        "name": "Eliminar",
        "description": "Permite eliminar registros",
    },
    {
        "code": PermissionAction.Action.EXPORT,
        "name": "Exportar",
        "description": "Permite exportar datos",
    },
    {
        "code": PermissionAction.Action.APPROVE,
        "name": "Aprobar",
        "description": "Permite aprobar acciones",
    },
]


class AccountsApiError(Exception):
    def __init__(self, detail, status=400):
        super().__init__(detail)
        self.detail = detail
        self.status = status


def get_or_create_profile(user):
    defaults = {
        "role": UserProfile.Role.ADMINISTRATOR if user.is_superuser else UserProfile.Role.OPERATOR,
    }
    return UserProfile.objects.get_or_create(user=user, defaults=defaults)[0]


def require_admin(user):
    from .permissions import has_module_permission

    profile = get_or_create_profile(user)
    if user.is_superuser or user.is_staff:
        return profile

    ensure_permission_catalog()
    if has_module_permission(user, "admin_users", "view"):
        return profile
    raise AccountsApiError("You do not have permission for this action", status=403)


def parse_boolean(value):
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return False
    return str(value).strip().lower() in {"true", "1", "yes", "on"}


def profile_payload_value(payload, key, default=""):
    if hasattr(payload, "get"):
        value = payload.get(key, default)
        return default if value is None else value
    return default


def clean_string(value):
    return str(value or "").strip()


def serialize_user_profile(user):
    from .permissions import has_module_permission

    profile = get_or_create_profile(user)
    ensure_permission_catalog()
    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.get_full_name() or user.username,
        "email": user.email,
        "phone": profile.phone,
        "telegram_chat_id": profile.telegram_chat_id,
        "role": profile.role,
        "role_label": profile.get_role_display(),
        "status": profile.status,
        "status_label": profile.get_status_display(),
        "sector_default_id": profile.sector_default_id,
        "sector_default": profile.sector_default.name if profile.sector_default else None,
        "last_access": profile.last_access.isoformat() if profile.last_access else None,
        "avatar_url": profile.avatar.url if profile.avatar else None,
        "preferred_theme": profile.preferred_theme,
        "unread_messages_count": user_unread_message_count(user),
        "open_alarm_count": user_open_alarm_count(user),
        "is_admin": user.is_superuser or user.is_staff or has_module_permission(user, "admin_users", "view"),
    }


def list_profiles_for_admin(user):
    require_admin(user)
    user_model = get_user_model()
    queryset = user_model.objects.select_related("profile__sector_default").order_by("username")
    return [serialize_user_profile(item) for item in queryset]


def get_profile_for_admin(user, profile_user_id):
    require_admin(user)
    user_model = get_user_model()
    target_user = get_object_or_404(user_model.objects.select_related("profile__sector_default"), pk=profile_user_id)
    return serialize_user_profile(target_user)


def _save_validated(instance):
    try:
        instance.full_clean()
    except ValidationError as exc:
        raise AccountsApiError(exc.message_dict or exc.messages)
    instance.save()
    return instance


def update_own_profile(user, payload, files=None):
    profile = get_or_create_profile(user)
    user.first_name = clean_string(profile_payload_value(payload, "first_name", user.first_name))
    user.last_name = clean_string(profile_payload_value(payload, "last_name", user.last_name))
    user.email = clean_string(profile_payload_value(payload, "email", user.email))

    preferred_theme = clean_string(profile_payload_value(payload, "preferred_theme", profile.preferred_theme))
    if preferred_theme in {choice for choice, _ in UserProfile.PreferredTheme.choices}:
        profile.preferred_theme = preferred_theme

    profile.phone = clean_string(profile_payload_value(payload, "phone", profile.phone))
    profile.telegram_chat_id = clean_string(
        profile_payload_value(payload, "telegram_chat_id", profile.telegram_chat_id)
    )

    if files and files.get("avatar"):
        profile.avatar = files["avatar"]
    elif parse_boolean(profile_payload_value(payload, "clear_avatar")):
        profile.avatar.delete(save=False)
        profile.avatar = None

    _save_validated(user)
    _save_validated(profile)
    return serialize_user_profile(user)


def create_profile_for_admin(user, payload, files=None):
    require_admin(user)
    user_model = get_user_model()
    username = clean_string(profile_payload_value(payload, "username"))
    password = profile_payload_value(payload, "password")
    if not username or not password:
        raise AccountsApiError("username and password are required")
    if user_model.objects.filter(username__iexact=username).exists():
        raise AccountsApiError("A user with this username already exists")

    created_user = user_model.objects.create_user(
        username=username,
        password=password,
        first_name=clean_string(profile_payload_value(payload, "first_name")),
        last_name=clean_string(profile_payload_value(payload, "last_name")),
        email=clean_string(profile_payload_value(payload, "email")),
    )
    profile = get_or_create_profile(created_user)
    profile.role = profile_payload_value(payload, "role", profile.role) or profile.role
    profile.status = profile_payload_value(payload, "status", profile.status) or profile.status
    profile.phone = clean_string(profile_payload_value(payload, "phone"))
    profile.telegram_chat_id = clean_string(profile_payload_value(payload, "telegram_chat_id"))
    profile.preferred_theme = (
        profile_payload_value(payload, "preferred_theme", profile.preferred_theme) or profile.preferred_theme
    )
    sector_default_id = profile_payload_value(payload, "sector_default_id")
    if sector_default_id not in (None, "", []):
        from inventory.models import Sector

        profile.sector_default = get_object_or_404(Sector, pk=sector_default_id)
    if files and files.get("avatar"):
        profile.avatar = files["avatar"]

    _save_validated(profile)
    return serialize_user_profile(created_user)


def update_profile_for_admin(user, profile_user_id, payload, files=None):
    require_admin(user)
    user_model = get_user_model()
    target_user = get_object_or_404(user_model.objects.select_related("profile"), pk=profile_user_id)
    profile = get_or_create_profile(target_user)

    username = clean_string(profile_payload_value(payload, "username", target_user.username))
    if username and user_model.objects.exclude(pk=target_user.pk).filter(username__iexact=username).exists():
        raise AccountsApiError("A user with this username already exists")

    target_user.username = username or target_user.username
    target_user.first_name = clean_string(profile_payload_value(payload, "first_name", target_user.first_name))
    target_user.last_name = clean_string(profile_payload_value(payload, "last_name", target_user.last_name))
    target_user.email = clean_string(profile_payload_value(payload, "email", target_user.email))

    role = profile_payload_value(payload, "role", profile.role)
    status = profile_payload_value(payload, "status", profile.status)
    preferred_theme = profile_payload_value(payload, "preferred_theme", profile.preferred_theme)

    if role:
        profile.role = role
    if status:
        profile.status = status
    if preferred_theme in {choice for choice, _ in UserProfile.PreferredTheme.choices}:
        profile.preferred_theme = preferred_theme

    profile.phone = clean_string(profile_payload_value(payload, "phone", profile.phone))
    profile.telegram_chat_id = clean_string(
        profile_payload_value(payload, "telegram_chat_id", profile.telegram_chat_id)
    )
    sector_default_id = profile_payload_value(payload, "sector_default_id")
    if sector_default_id not in (None, "", []):
        from inventory.models import Sector

        profile.sector_default = get_object_or_404(Sector, pk=sector_default_id)
    elif "sector_default_id" in payload:
        profile.sector_default = None

    if files and files.get("avatar"):
        profile.avatar = files["avatar"]
    elif parse_boolean(profile_payload_value(payload, "clear_avatar")):
        profile.avatar.delete(save=False)
        profile.avatar = None

    _save_validated(target_user)
    _save_validated(profile)
    return serialize_user_profile(target_user)


def reset_profile_password_for_admin(user, profile_user_id, payload):
    require_admin(user)
    user_model = get_user_model()
    target_user = get_object_or_404(user_model, pk=profile_user_id)
    new_password = profile_payload_value(payload, "new_password")
    if not new_password:
        raise AccountsApiError("new_password is required")
    target_user.set_password(new_password)
    target_user.save(update_fields=["password"])
    return {"id": target_user.id, "username": target_user.username}


def ensure_permission_catalog():
    for action_data in DEFAULT_PERMISSION_ACTIONS:
        PermissionAction.objects.get_or_create(
            code=action_data["code"],
            defaults={
                "name": action_data["name"],
                "description": action_data["description"],
            },
        )

    for module_data in DEFAULT_PERMISSION_MODULES:
        PermissionModule.objects.get_or_create(
            code=module_data["code"],
            defaults={
                "name": module_data["name"],
                "description": module_data["description"],
                "order": module_data["order"],
            },
        )

    if not RolePermission.objects.exists():
        _seed_default_role_permissions()


def _seed_default_role_permissions():
    role_permissions_config = {
        UserProfile.Role.ADMINISTRATOR: {
            "inventory_overview": ["view"],
            "stock_management": ["view", "create", "change", "delete", "export"],
            "movements": ["view", "create", "change", "delete", "approve"],
            "checkouts": ["view", "create", "change", "delete"],
            "alarms": ["view", "create", "change"],
            "counts": ["view", "create", "change", "delete"],
            "discrepancies": ["view", "create", "change", "delete", "approve"],
            "admin_users": ["view", "create", "change", "delete"],
            "personal": ["view", "create", "change", "delete", "export"],
            "tia": ["view", "change"],
            "purchasing": ["view", "create", "change", "approve"],
            "reports": ["view", "export"],
            "settings": ["view", "change"],
            "deposits_overview": ["view"],
            "pallet_registry": ["view", "create", "change", "delete"],
            "deposit_layout": ["view", "create", "change", "delete"],
            "pallet_scans": ["view", "create", "change"],
        },
        UserProfile.Role.STOREKEEPER: {
            "inventory_overview": ["view"],
            "stock_management": ["view", "change"],
            "movements": ["view", "create"],
            "checkouts": ["view", "create"],
            "alarms": ["view"],
            "counts": ["view", "create"],
            "discrepancies": ["view"],
            "personal": ["view", "export"],
            "tia": ["view"],
            "deposits_overview": ["view"],
            "pallet_registry": ["view", "create", "change", "delete"],
            "deposit_layout": ["view", "create", "change", "delete"],
            "pallet_scans": ["view", "create", "change"],
        },
        UserProfile.Role.SUPERVISOR: {
            "inventory_overview": ["view"],
            "stock_management": ["view", "change"],
            "movements": ["view"],
            "checkouts": ["view"],
            "alarms": ["view"],
            "counts": ["view", "create", "change"],
            "discrepancies": ["view"],
            "reports": ["view", "export"],
            "personal": ["view", "export"],
            "tia": ["view"],
            "deposits_overview": ["view"],
            "pallet_registry": ["view"],
            "deposit_layout": ["view"],
            "pallet_scans": ["view", "create"],
        },
        UserProfile.Role.OPERATOR: {
            "inventory_overview": ["view"],
            "stock_management": ["view"],
            "movements": ["view", "create"],
            "checkouts": ["view", "create"],
            "alarms": ["view"],
            "personal": ["view", "export"],
            "deposits_overview": ["view"],
            "pallet_registry": ["view"],
            "deposit_layout": ["view"],
            "pallet_scans": ["view", "create"],
        },
        UserProfile.Role.AUDITOR: {
            "inventory_overview": ["view"],
            "stock_management": ["view"],
            "movements": ["view"],
            "checkouts": ["view"],
            "alarms": ["view"],
            "counts": ["view"],
            "discrepancies": ["view"],
            "reports": ["view", "export"],
            "personal": ["view", "export"],
            "deposits_overview": ["view"],
            "pallet_registry": ["view"],
            "deposit_layout": ["view"],
        },
        UserProfile.Role.MAINTENANCE: {
            "inventory_overview": ["view"],
            "movements": ["view", "create"],
            "personal": ["view", "export"],
            "tia": ["view"],
        },
        UserProfile.Role.PURCHASING: {
            "inventory_overview": ["view"],
            "stock_management": ["view"],
            "movements": ["view", "create"],
            "purchasing": ["view", "create", "change"],
            "reports": ["view", "export"],
            "personal": ["view", "export"],
        },
    }

    actions = {action.code: action for action in PermissionAction.objects.all()}
    modules = {module.code: module for module in PermissionModule.objects.all()}

    for role, modules_config in role_permissions_config.items():
        for module_code, action_codes in modules_config.items():
            module = modules.get(module_code)
            if not module:
                continue
            role_perm, _ = RolePermission.objects.get_or_create(role=role, module=module)
            role_perm.actions.set([actions[action_code] for action_code in action_codes if action_code in actions])


def _serialize_permission_module(module):
    return {
        "code": module.code,
        "name": module.name,
        "order": module.order,
    }


def _serialize_permission_action(action):
    return {
        "code": action.code,
        "name": action.name,
    }


def permissions_meta_for_admin(user):
    require_admin(user)
    ensure_permission_catalog()
    modules = list(PermissionModule.objects.order_by("order", "name"))
    actions = list(PermissionAction.objects.order_by("code"))

    from inventory.models import Sector

    sectors = list(Sector.objects.order_by("name"))

    return {
        "modules": [_serialize_permission_module(module) for module in modules],
        "actions": [_serialize_permission_action(action) for action in actions],
        "roles": [{"value": value, "label": label} for value, label in UserProfile.Role.choices],
        "sectors": [{"id": sector.id, "name": sector.name, "code": sector.code} for sector in sectors],
    }


def role_permissions_for_admin(user, role):
    require_admin(user)
    ensure_permission_catalog()
    if role not in {value for value, _ in UserProfile.Role.choices}:
        raise AccountsApiError("Unknown role")

    perms = (
        RolePermission.objects.filter(role=role)
        .select_related("module")
        .prefetch_related("actions")
        .order_by("module__order", "module__name")
    )
    return {
        "role": role,
        "items": [
            {
                "module": perm.module.code,
                "actions": [action.code for action in perm.actions.all()],
            }
            for perm in perms
        ],
    }


def save_role_permissions_for_admin(user, role, payload):
    require_admin(user)
    ensure_permission_catalog()
    if role not in {value for value, _ in UserProfile.Role.choices}:
        raise AccountsApiError("Unknown role")

    items = payload.get("items") if hasattr(payload, "get") else None
    if not isinstance(items, list):
        raise AccountsApiError("items must be a list")

    modules = {module.code: module for module in PermissionModule.objects.all()}
    actions = {action.code: action for action in PermissionAction.objects.all()}

    requested = {}
    for entry in items:
        if not isinstance(entry, dict):
            continue
        module_code = clean_string(entry.get("module"))
        if not module_code:
            continue
        if module_code not in modules:
            raise AccountsApiError(f"Unknown module {module_code}")
        action_codes = entry.get("actions") or []
        if not isinstance(action_codes, list):
            raise AccountsApiError("actions must be a list")
        normalized_actions = []
        for action_code in action_codes:
            action_code = clean_string(action_code)
            if not action_code:
                continue
            if action_code not in actions:
                raise AccountsApiError(f"Unknown action {action_code}")
            normalized_actions.append(action_code)
        requested[module_code] = list(dict.fromkeys(normalized_actions))

    for module_code, module in modules.items():
        desired_actions = requested.get(module_code, [])
        existing = RolePermission.objects.filter(role=role, module=module).first()
        if not desired_actions:
            if existing:
                existing.delete()
            continue
        if not existing:
            existing = RolePermission.objects.create(role=role, module=module)
        existing.actions.set([actions[code] for code in desired_actions])

    return role_permissions_for_admin(user, role)


def user_permissions_for_admin(user, profile_user_id):
    require_admin(user)
    ensure_permission_catalog()
    user_model = get_user_model()
    target_user = get_object_or_404(user_model.objects.select_related("profile", "permissions"), pk=profile_user_id)
    user_permission, _ = UserPermission.objects.get_or_create(
        user=target_user,
        defaults={"inherit_role_permissions": True},
    )

    module_perms = (
        UserModulePermission.objects.filter(user_permission=user_permission)
        .select_related("module")
        .prefetch_related("actions")
        .order_by("module__order", "module__name")
    )
    sector_perms = (
        SectorPermission.objects.filter(user=target_user)
        .select_related("sector")
        .order_by("sector__name")
    )

    return {
        "user_id": target_user.id,
        "inherit_role_permissions": user_permission.inherit_role_permissions,
        "module_permissions": [
            {
                "module": perm.module.code,
                "allow": perm.allow,
                "actions": [action.code for action in perm.actions.all()],
            }
            for perm in module_perms
        ],
        "sector_permissions": [
            {
                "sector_id": perm.sector_id,
                "sector": perm.sector.name,
                "can_view": perm.can_view,
                "can_edit": perm.can_edit,
                "can_delete": perm.can_delete,
            }
            for perm in sector_perms
        ],
    }


def save_user_permissions_for_admin(user, profile_user_id, payload):
    require_admin(user)
    ensure_permission_catalog()
    user_model = get_user_model()
    target_user = get_object_or_404(user_model.objects.select_related("permissions"), pk=profile_user_id)
    user_permission, _ = UserPermission.objects.get_or_create(
        user=target_user,
        defaults={"inherit_role_permissions": True},
    )

    inherit_role = payload.get("inherit_role_permissions") if hasattr(payload, "get") else None
    if inherit_role is not None:
        user_permission.inherit_role_permissions = parse_boolean(inherit_role)
        _save_validated(user_permission)

    modules = {module.code: module for module in PermissionModule.objects.all()}
    actions = {action.code: action for action in PermissionAction.objects.all()}

    module_items = payload.get("module_permissions") if hasattr(payload, "get") else None
    if module_items is not None:
        if not isinstance(module_items, list):
            raise AccountsApiError("module_permissions must be a list")

        desired = {}
        for entry in module_items:
            if not isinstance(entry, dict):
                continue
            module_code = clean_string(entry.get("module"))
            if not module_code:
                continue
            if module_code not in modules:
                raise AccountsApiError(f"Unknown module {module_code}")
            allow = parse_boolean(entry.get("allow", True))
            action_codes = entry.get("actions") or []
            if not isinstance(action_codes, list):
                raise AccountsApiError("actions must be a list")
            normalized_actions = []
            for action_code in action_codes:
                action_code = clean_string(action_code)
                if not action_code:
                    continue
                if action_code not in actions:
                    raise AccountsApiError(f"Unknown action {action_code}")
                normalized_actions.append(action_code)
            desired[module_code] = {
                "allow": allow,
                "actions": list(dict.fromkeys(normalized_actions)),
            }

        existing = {
            perm.module.code: perm
            for perm in UserModulePermission.objects.filter(user_permission=user_permission).select_related("module")
        }

        for module_code, module in modules.items():
            desired_entry = desired.get(module_code)
            perm = existing.get(module_code)
            if not desired_entry or not desired_entry["actions"]:
                if perm:
                    perm.delete()
                continue
            if not perm:
                perm = UserModulePermission.objects.create(
                    user_permission=user_permission,
                    module=module,
                    allow=desired_entry["allow"],
                )
            else:
                perm.allow = desired_entry["allow"]
                _save_validated(perm)
            perm.actions.set([actions[code] for code in desired_entry["actions"]])

    sector_items = payload.get("sector_permissions") if hasattr(payload, "get") else None
    if sector_items is not None:
        if not isinstance(sector_items, list):
            raise AccountsApiError("sector_permissions must be a list")

        from inventory.models import Sector

        sectors = {str(sector.id): sector for sector in Sector.objects.all()}
        desired_sectors = {}
        for entry in sector_items:
            if not isinstance(entry, dict):
                continue
            sector_id = clean_string(entry.get("sector_id"))
            if not sector_id:
                continue
            if sector_id not in sectors:
                raise AccountsApiError(f"Unknown sector {sector_id}")
            desired_sectors[sector_id] = {
                "can_view": parse_boolean(entry.get("can_view", False)),
                "can_edit": parse_boolean(entry.get("can_edit", False)),
                "can_delete": parse_boolean(entry.get("can_delete", False)),
            }

        existing_sector = {str(p.sector_id): p for p in SectorPermission.objects.filter(user=target_user)}

        for sector_id, config in desired_sectors.items():
            perm = existing_sector.get(sector_id)
            if not perm:
                perm = SectorPermission.objects.create(
                    user=target_user,
                    sector=sectors[sector_id],
                    can_view=config["can_view"],
                    can_edit=config["can_edit"],
                    can_delete=config["can_delete"],
                )
            else:
                perm.can_view = config["can_view"]
                perm.can_edit = config["can_edit"]
                perm.can_delete = config["can_delete"]
                _save_validated(perm)

        for sector_id, perm in existing_sector.items():
            if sector_id not in desired_sectors:
                perm.delete()

    return user_permissions_for_admin(user, profile_user_id)
