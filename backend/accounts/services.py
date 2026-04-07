from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404

from communications.services import (
    user_open_alarm_count,
    user_unread_message_count,
)

from .models import UserProfile


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
    profile = get_or_create_profile(user)
    if user.is_superuser or profile.role == UserProfile.Role.ADMINISTRATOR:
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
    profile = get_or_create_profile(user)
    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.get_full_name() or user.username,
        "email": user.email,
        "phone": profile.phone,
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
        "is_admin": user.is_superuser or profile.role == UserProfile.Role.ADMINISTRATOR,
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
