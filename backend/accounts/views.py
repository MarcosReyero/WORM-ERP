import json

from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .models import UserProfile
from .services import (
    AccountsApiError,
    permissions_meta_for_admin,
    create_profile_for_admin,
    get_profile_for_admin,
    list_profiles_for_admin,
    reset_profile_password_for_admin,
    role_permissions_for_admin,
    serialize_user_profile,
    save_role_permissions_for_admin,
    update_own_profile,
    update_profile_for_admin,
    save_user_permissions_for_admin,
    user_permissions_for_admin,
)


def _parse_json(request):
    if not request.body:
        return {}

    try:
        return json.loads(request.body)
    except json.JSONDecodeError:
        raise AccountsApiError("Invalid JSON payload")


def _request_payload(request):
    content_type = request.headers.get("Content-Type", "")
    if "application/json" in content_type:
        return _parse_json(request)
    return request.POST


def _handle_accounts_call(callback):
    try:
        return callback()
    except AccountsApiError as exc:
        return JsonResponse({"detail": exc.detail}, status=exc.status)


@require_GET
@ensure_csrf_cookie
def csrf(request):
    return JsonResponse({"detail": "CSRF cookie initialized"})


@require_GET
@ensure_csrf_cookie
def session_status(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False})

    profile, _ = UserProfile.objects.get_or_create(
        user=request.user,
        defaults={
            "role": UserProfile.Role.ADMINISTRATOR if request.user.is_superuser else UserProfile.Role.OPERATOR,
        },
    )
    if profile.status == UserProfile.Status.INACTIVE:
        auth_logout(request)
        return JsonResponse({"authenticated": False})

    return JsonResponse(
        {
            "authenticated": True,
            "user": serialize_user_profile(request.user),
        }
    )


@require_POST
def login_view(request):
    try:
        payload = _parse_json(request)
    except AccountsApiError as exc:
        return JsonResponse({"detail": exc.detail}, status=exc.status)
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if not username or not password:
        return JsonResponse(
            {"detail": "Username and password are required"},
            status=400,
        )

    user = authenticate(request, username=username, password=password)
    if user is None:
        return JsonResponse({"detail": "Invalid credentials"}, status=400)

    auth_login(request, user)
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={
            "role": UserProfile.Role.ADMINISTRATOR if user.is_superuser else UserProfile.Role.OPERATOR,
        },
    )
    if profile.status == UserProfile.Status.INACTIVE:
        return JsonResponse({"detail": "This profile is inactive"}, status=403)
    profile.last_access = timezone.now()
    profile.save(update_fields=["last_access"])
    return JsonResponse(
        {
            "detail": "Login successful",
            "user": serialize_user_profile(user),
        }
    )


@require_POST
def logout_view(request):
    auth_logout(request)
    return JsonResponse({"detail": "Session closed"})


@require_http_methods(["GET", "POST"])
def profile_view(request):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required"}, status=401)

    if request.method == "GET":
        return JsonResponse({"item": serialize_user_profile(request.user)})

    def handler():
        item = update_own_profile(request.user, _request_payload(request), files=request.FILES)
        return JsonResponse({"detail": "Profile updated", "item": item})

    return _handle_accounts_call(handler)


@require_http_methods(["GET", "POST"])
def admin_profiles(request):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required"}, status=401)

    if request.method == "GET":
        return _handle_accounts_call(
            lambda: JsonResponse({"items": list_profiles_for_admin(request.user)})
        )

    def handler():
        item = create_profile_for_admin(request.user, _request_payload(request), files=request.FILES)
        return JsonResponse({"detail": "Profile created", "item": item}, status=201)

    return _handle_accounts_call(handler)


@require_http_methods(["GET", "POST"])
def admin_profile_detail(request, profile_user_id):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required"}, status=401)

    if request.method == "GET":
        return _handle_accounts_call(
            lambda: JsonResponse({"item": get_profile_for_admin(request.user, profile_user_id)})
        )

    def handler():
        item = update_profile_for_admin(
            request.user,
            profile_user_id,
            _request_payload(request),
            files=request.FILES,
        )
        return JsonResponse({"detail": "Profile updated", "item": item})

    return _handle_accounts_call(handler)


@require_POST
def admin_profile_reset_password(request, profile_user_id):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required"}, status=401)

    def handler():
        item = reset_profile_password_for_admin(
            request.user,
            profile_user_id,
            _request_payload(request),
        )
        return JsonResponse({"detail": "Password reset", "item": item})

    return _handle_accounts_call(handler)


@require_GET
def admin_permissions_meta(request):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required"}, status=401)

    return _handle_accounts_call(lambda: JsonResponse(permissions_meta_for_admin(request.user)))


@require_http_methods(["GET", "POST"])
def admin_role_permissions(request, role_code):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required"}, status=401)

    if request.method == "GET":
        return _handle_accounts_call(
            lambda: JsonResponse(role_permissions_for_admin(request.user, role_code))
        )

    def handler():
        payload = _request_payload(request)
        item = save_role_permissions_for_admin(request.user, role_code, payload)
        return JsonResponse(item)

    return _handle_accounts_call(handler)


@require_http_methods(["GET", "POST"])
def admin_user_permissions(request, profile_user_id):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication required"}, status=401)

    if request.method == "GET":
        return _handle_accounts_call(
            lambda: JsonResponse({"item": user_permissions_for_admin(request.user, profile_user_id)})
        )

    def handler():
        payload = _request_payload(request)
        item = save_user_permissions_for_admin(request.user, profile_user_id, payload)
        return JsonResponse({"item": item})

    return _handle_accounts_call(handler)
