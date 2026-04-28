from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from accounts.permissions import has_module_permission
from accounts.services import ensure_permission_catalog

from .services import parse_json
from .tia import (
    TiaMcpError,
    build_tia_ai_reports,
    build_tia_overview,
    get_tia_mcp_config,
    list_tia_logs,
    save_tia_mcp_config,
    test_tia_mcp_connection,
)


def _unauthorized():
    return JsonResponse({"detail": "Authentication required"}, status=401)


def _forbidden():
    return JsonResponse(
        {"detail": "No tienes permiso para acceder a esta sección", "code": "PERMISSION_DENIED"},
        status=403,
    )


def _require_permission(request, module_code, action_code="view"):
    ensure_permission_catalog()
    if not has_module_permission(request.user, module_code, action_code):
        return _forbidden()
    return None


@require_GET
def tia_overview(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    denied = _require_permission(request, "tia", "view")
    if denied:
        return denied
    return JsonResponse(build_tia_overview(request.user))


@require_GET
def tia_ai_reports(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    denied = _require_permission(request, "tia", "view")
    if denied:
        return denied
    return JsonResponse(build_tia_ai_reports(request.user))


@require_http_methods(["GET", "POST"])
def tia_mcp_config(request):
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "tia", "view")
        if denied:
            return denied
        return JsonResponse({"item": get_tia_mcp_config(), "logs": list_tia_logs()})

    try:
        denied = _require_permission(request, "tia", "change")
        if denied:
            return denied
        config = save_tia_mcp_config(parse_json(request))
    except TiaMcpError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    return JsonResponse({"detail": "TIA MCP config saved", "item": config, "logs": list_tia_logs()})


@require_http_methods(["POST"])
def tia_mcp_test(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    denied = _require_permission(request, "tia", "change")
    if denied:
        return denied
    return JsonResponse({"item": test_tia_mcp_connection()})


@require_GET
def tia_mcp_logs(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    denied = _require_permission(request, "tia", "view")
    if denied:
        return denied
    return JsonResponse({"items": list_tia_logs()})
