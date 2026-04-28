from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from accounts.services import ensure_permission_catalog

from .deposits import (
    build_deposit_layout,
    build_deposits_overview,
    create_pallet,
    get_pallet_detail,
    list_pallets,
    scan_pallet,
    update_pallet,
)
from .services import InventoryApiError, parse_json


def _unauthorized():
    return JsonResponse({"detail": "Authentication required"}, status=401)


def _request_payload(request):
    content_type = request.headers.get("Content-Type", "")
    if "application/json" in content_type:
        return parse_json(request)
    return request.POST.dict()


def _handle_deposits_call(callback):
    try:
        return callback()
    except InventoryApiError as exc:
        return JsonResponse({"detail": exc.detail}, status=exc.status)


@require_GET
def deposits_overview(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    ensure_permission_catalog()
    return _handle_deposits_call(lambda: JsonResponse(build_deposits_overview(request.user)))


@require_GET
def deposits_layout(request, location_id):
    if not request.user.is_authenticated:
        return _unauthorized()
    ensure_permission_catalog()
    return _handle_deposits_call(lambda: JsonResponse(build_deposit_layout(request.user, location_id)))


@require_http_methods(["GET", "POST"])
def pallets(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    ensure_permission_catalog()

    if request.method == "GET":
        return _handle_deposits_call(
            lambda: JsonResponse({"items": list_pallets(request.user, request.GET)})
        )

    return _handle_deposits_call(
        lambda: JsonResponse(
            {
                "detail": "Pallet created",
                "item": get_pallet_detail(
                    request.user,
                    create_pallet(request.user, _request_payload(request)).id,
                )["item"],
            },
            status=201,
        )
    )


@require_http_methods(["GET", "POST"])
def pallet_detail(request, pallet_id):
    if not request.user.is_authenticated:
        return _unauthorized()
    ensure_permission_catalog()

    if request.method == "GET":
        return _handle_deposits_call(lambda: JsonResponse(get_pallet_detail(request.user, pallet_id)))

    return _handle_deposits_call(
        lambda: JsonResponse(
            {
                "detail": "Pallet updated",
                "item": get_pallet_detail(
                    request.user,
                    update_pallet(request.user, pallet_id, _request_payload(request)).id,
                )["item"],
            }
        )
    )


@require_http_methods(["POST"])
def pallet_scan(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    ensure_permission_catalog()
    return _handle_deposits_call(
        lambda: JsonResponse(scan_pallet(request.user, _request_payload(request)))
    )
