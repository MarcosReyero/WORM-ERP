from django.http import HttpResponse, JsonResponse
from django.db.utils import DatabaseError
from django.views.decorators.http import require_GET, require_http_methods

from accounts.permissions import has_module_permission
from accounts.services import ensure_permission_catalog

from communications.services import (
    CommunicationsApiError,
    create_inventory_alarm,
    list_inventory_alarms,
)

from .models import (
    AssetCheckout,
    Article,
    InventoryBalance,
    InventoryBatch,
    PhysicalCountSession,
    StockDiscrepancy,
    StockMovement,
    TrackedUnit,
)
from .services import (
    InventoryApiError,
    add_count_line,
    build_stock_export_excel,
    build_dashboard,
    build_inventory_overview,
    build_personal_daily_reports_export_excel,
    create_internal_request,
    create_personal_daily_report,
    create_article,
    list_internal_requests,
    get_article_detail,
    get_full_stock_report_config,
    get_minimum_stock_digest_config,
    get_purchasing_minimum_stock_alarm_config,
    create_count_session,
    create_discrepancy,
    create_movement,
    create_checkout,
    import_articles_from_excel,
    import_personal_daily_reports_from_excel,
    bulk_delete_personal_daily_reports,
    delete_personal_daily_report,
    list_articles,
    list_personal_daily_reports,
    list_safety_stock_alerts,
    active_alarm_recipients,
    parse_json,
    resolve_discrepancy,
    return_checkout,
    save_minimum_stock_digest_config,
    save_full_stock_report_config,
    save_purchasing_minimum_stock_alarm_config,
    save_safety_stock_alert_rule,
    serialize_article,
    serialize_balance,
    serialize_batch,
    serialize_catalogs,
    serialize_checkout,
    serialize_count_session,
    serialize_discrepancy,
    serialize_movement,
    serialize_personal_daily_report,
    serialize_tracked_unit,
    update_personal_daily_report,
    update_article,
)


def _unauthorized():
    """Maneja unauthorized."""
    return JsonResponse({"detail": "Authentication required"}, status=401)


def _forbidden():
    """Maneja forbidden."""
    return JsonResponse(
        {"detail": "No tienes permiso para acceder a esta sección", "code": "PERMISSION_DENIED"},
        status=403,
    )


def _require_permission(request, module_code, action_code="view"):
    """Maneja require permission."""
    ensure_permission_catalog()
    if not has_module_permission(request.user, module_code, action_code):
        return _forbidden()
    return None


def _handle_inventory_call(callback):
    """Maneja handle inventory call."""
    try:
        return callback()
    except InventoryApiError as exc:
        return JsonResponse({"detail": exc.detail}, status=exc.status)
    except CommunicationsApiError as exc:
        return JsonResponse({"detail": exc.detail}, status=exc.status)
    except DatabaseError as exc:
        return JsonResponse(
            {
                "detail": "Error interno de base de datos. Verifica que corriste las migraciones del backend.",
                "code": "DATABASE_ERROR",
            },
            status=500,
        )
    except Exception as exc:  # noqa: BLE001
        return JsonResponse(
            {
                "detail": "Error interno del servidor.",
                "code": "INTERNAL_ERROR",
                "error": str(exc),
                "error_type": exc.__class__.__name__,
            },
            status=500,
        )


def _request_payload(request):
    """Maneja request payload."""
    content_type = request.headers.get("Content-Type", "")
    if "application/json" in content_type:
        return parse_json(request)
    return request.POST.dict()


@require_GET
def dashboard(request):
    """Maneja dashboard."""
    if not request.user.is_authenticated:
        return _unauthorized()
    return JsonResponse(build_dashboard(request.user))


@require_GET
def inventory_overview(request):
    """Maneja inventory overview."""
    if not request.user.is_authenticated:
        return _unauthorized()
    denied = _require_permission(request, "inventory_overview", "view")
    if denied:
        return denied

    def handler():
        """Maneja handler."""
        return JsonResponse(build_inventory_overview(request.user))

    return _handle_inventory_call(handler)


@require_GET
def catalogs(request):
    """Maneja catalogs."""
    if not request.user.is_authenticated:
        return _unauthorized()

    ensure_permission_catalog()
    can_view_any_module = any(
        has_module_permission(request.user, module_code, "view")
        for module_code in (
            "inventory_overview",
            "deposits_overview",
            "personal",
            "tia",
            "purchasing",
        )
    )
    if not can_view_any_module:
        return _forbidden()

    return JsonResponse(serialize_catalogs())


@require_http_methods(["GET", "POST"])
def articles(request):
    """Maneja articles."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "stock_management", "view")
        if denied:
            return denied
        return JsonResponse({"items": list_articles()})

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "stock_management", "create")
        if denied:
            return denied
        article = create_article(request.user, _request_payload(request), files=request.FILES)
        return JsonResponse(
            {"detail": "Article created", "id": article.id, "item": get_article_detail(article.id)["article"]},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def article_detail(request, article_id):
    """Maneja article detail."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "stock_management", "view")
        if denied:
            return denied
        return JsonResponse(get_article_detail(article_id))

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "stock_management", "change")
        if denied:
            return denied
        article = update_article(
            request.user,
            article_id,
            _request_payload(request),
            files=request.FILES,
        )
        return JsonResponse({"detail": "Article updated", "item": get_article_detail(article.id)})

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def article_import_excel(request):
    """Maneja article import excel."""
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "stock_management", "create")
        if denied:
            return denied
        payload = _request_payload(request)
        mode = payload.get("mode") or "preview"
        result = import_articles_from_excel(request.user, request.FILES.get("file"), mode=mode)
        status = 201 if result["mode"] == "confirm" else 200
        detail = "Excel imported" if result["mode"] == "confirm" else "Excel analyzed"
        return JsonResponse({"detail": detail, "item": result}, status=status)

    return _handle_inventory_call(handler)


@require_GET
def article_export_excel(request):
    """Maneja article export excel."""
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "stock_management", "export")
        if denied:
            return denied
        filename, payload = build_stock_export_excel(request.GET)
        response = HttpResponse(
            payload,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def personal_daily_reports(request):
    """Maneja personal daily reports."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "personal", "view")
        if denied:
            return denied
        items = list_personal_daily_reports(request.user)
        return JsonResponse({"items": items})

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "personal", "create")
        if denied:
            return denied
        report = create_personal_daily_report(request.user, _request_payload(request))
        return JsonResponse(
            {"detail": "Personal report created", "item": serialize_personal_daily_report(report)},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def personal_daily_report_detail(request, report_id):
    """Maneja personal daily report detail."""
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "personal", "change")
        if denied:
            return denied
        report = update_personal_daily_report(request.user, report_id, _request_payload(request))
        return JsonResponse({"detail": "Personal report updated", "item": serialize_personal_daily_report(report)})

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def personal_daily_report_delete(request, report_id):
    """Maneja personal daily report delete."""
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "personal", "delete")
        if denied:
            return denied
        delete_personal_daily_report(request.user, report_id)
        return JsonResponse({"detail": "Personal report deleted"})

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def personal_daily_report_bulk_delete(request):
    """Maneja personal daily report bulk delete."""
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "personal", "delete")
        if denied:
            return denied
        payload = parse_json(request)
        if not isinstance(payload, dict):
            raise InventoryApiError("Invalid payload")

        delete_all = bool(payload.get("all"))
        ids = payload.get("ids") or payload.get("report_ids")
        result = bulk_delete_personal_daily_reports(request.user, report_ids=ids, delete_all=delete_all)
        return JsonResponse({"detail": "Personal reports deleted", "item": result})

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def personal_daily_report_import_excel(request):
    """Maneja personal daily report import excel."""
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "personal", "create")
        if denied:
            return denied
        result = import_personal_daily_reports_from_excel(request.user, request.FILES.get("file"))
        return JsonResponse({"detail": "Excel imported", "item": result}, status=201)

    return _handle_inventory_call(handler)


@require_GET
def personal_daily_report_export_excel(request):
    """Maneja personal daily report export excel."""
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "personal", "export")
        if denied:
            return denied
        filename, payload = build_personal_daily_reports_export_excel(request.user, request.GET)
        response = HttpResponse(
            payload,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    return _handle_inventory_call(handler)


@require_GET
def balances(request):
    """Maneja balances."""
    if not request.user.is_authenticated:
        return _unauthorized()
    denied = _require_permission(request, "stock_management", "view")
    if denied:
        return denied
    items = [
        serialize_balance(balance)
        for balance in InventoryBalance.objects.select_related("article", "location", "batch")
        .order_by("article__name", "location__name")
    ]
    return JsonResponse({"items": items})


@require_GET
def batches(request):
    """Maneja batches."""
    if not request.user.is_authenticated:
        return _unauthorized()
    denied = _require_permission(request, "stock_management", "view")
    if denied:
        return denied
    items = [
        serialize_batch(batch)
        for batch in InventoryBatch.objects.select_related("article", "supplier")
        .order_by("article__name", "lot_code")
    ]
    return JsonResponse({"items": items})


@require_GET
def tracked_units(request):
    """Maneja tracked units."""
    if not request.user.is_authenticated:
        return _unauthorized()
    denied = _require_permission(request, "stock_management", "view")
    if denied:
        return denied
    items = [
        serialize_tracked_unit(unit)
        for unit in TrackedUnit.objects.select_related(
            "article",
            "current_location",
            "current_sector",
            "current_holder_person",
        ).order_by("internal_tag")
    ]
    return JsonResponse({"items": items})


@require_http_methods(["GET", "POST"])
def movements(request):
    """Maneja movements."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "movements", "view")
        if denied:
            return denied
        items = [
            serialize_movement(movement)
            for movement in StockMovement.objects.select_related(
                "article",
                "recorded_by",
                "tracked_unit",
                "source_location",
                "target_location",
                "person",
                "sector",
                "authorized_by",
            ).order_by("-timestamp", "-id")
        ]
        return JsonResponse({"items": items})

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "movements", "create")
        if denied:
            return denied
        movement = create_movement(request.user, parse_json(request))
        return JsonResponse(
            {"detail": "Movement registered", "item": serialize_movement(movement)},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def checkouts(request):
    """Maneja checkouts."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "checkouts", "view")
        if denied:
            return denied
        items = [
            serialize_checkout(checkout)
            for checkout in AssetCheckout.objects.select_related(
                "tracked_unit__article",
                "receiver_person",
                "receiver_sector",
                "recorded_by",
            ).order_by("-checked_out_at")
        ]
        return JsonResponse({"items": items})

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "checkouts", "create")
        if denied:
            return denied
        checkout = create_checkout(request.user, parse_json(request))
        return JsonResponse(
            {"detail": "Checkout registered", "item": serialize_checkout(checkout)},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def checkout_return(request, checkout_id):
    """Maneja checkout return."""
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "checkouts", "change")
        if denied:
            return denied
        checkout = return_checkout(request.user, checkout_id, parse_json(request))
        return JsonResponse({"detail": "Checkout returned", "item": serialize_checkout(checkout)})

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def count_sessions(request):
    """Maneja count sessions."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "counts", "view")
        if denied:
            return denied
        items = [
            serialize_count_session(session)
            for session in PhysicalCountSession.objects.prefetch_related("lines")
            .order_by("-scheduled_for")
        ]
        return JsonResponse({"items": items})

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "counts", "create")
        if denied:
            return denied
        session = create_count_session(request.user, parse_json(request))
        return JsonResponse(
            {"detail": "Count session created", "item": serialize_count_session(session)},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def count_session_lines(request, session_id):
    """Maneja count session lines."""
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "counts", "create")
        if denied:
            return denied
        line = add_count_line(request.user, session_id, parse_json(request))
        return JsonResponse(
            {
                "detail": "Count line registered",
                "item": {
                    "id": line.id,
                    "article_id": line.article_id,
                    "location_id": line.location_id,
                },
            },
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def discrepancies(request):
    """Maneja discrepancies."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "discrepancies", "view")
        if denied:
            return denied
        items = [
            serialize_discrepancy(discrepancy)
            for discrepancy in StockDiscrepancy.objects.select_related(
                "article",
                "location",
                "detected_by",
                "movement",
            ).order_by("-detected_at")
        ]
        return JsonResponse({"items": items})

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "discrepancies", "create")
        if denied:
            return denied
        discrepancy = create_discrepancy(request.user, parse_json(request))
        return JsonResponse(
            {"detail": "Discrepancy registered", "item": serialize_discrepancy(discrepancy)},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def discrepancy_resolve(request, discrepancy_id):
    """Maneja discrepancy resolve."""
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "discrepancies", "approve")
        if denied:
            return denied
        discrepancy = resolve_discrepancy(request.user, discrepancy_id, parse_json(request))
        return JsonResponse(
            {"detail": "Discrepancy resolved", "item": serialize_discrepancy(discrepancy)}
        )

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def inventory_alarms(request):
    """Maneja inventory alarms."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "alarms", "view")
        if denied:
            return denied
        return _handle_inventory_call(
            lambda: JsonResponse({"items": list_inventory_alarms(request.user)})
        )

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "alarms", "create")
        if denied:
            return denied
        item = create_inventory_alarm(request.user, parse_json(request))
        return JsonResponse({"detail": "Alarm created", "item": item}, status=201)

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def inventory_safety_alerts(request):
    """Maneja inventory safety alerts."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "alarms", "view")
        if denied:
            return denied
        return _handle_inventory_call(
            lambda: JsonResponse({"items": list_safety_stock_alerts(request.user)})
        )

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "alarms", "change")
        if denied:
            return denied
        item = save_safety_stock_alert_rule(request.user, parse_json(request))
        return JsonResponse({"detail": "Safety alert saved", "item": item}, status=201)

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def inventory_minimum_stock_digest(request):
    """Maneja inventory minimum stock digest."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "alarms", "view")
        if denied:
            return denied
        return _handle_inventory_call(
            lambda: JsonResponse({"item": get_minimum_stock_digest_config(request.user)})
        )

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "alarms", "change")
        if denied:
            return denied
        item = save_minimum_stock_digest_config(request.user, parse_json(request))
        return JsonResponse({"detail": "Minimum stock digest saved", "item": item}, status=201)

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def inventory_full_stock_report(request):
    """Maneja inventory full stock report."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "reports", "view")
        if denied:
            return denied
        return _handle_inventory_call(
            lambda: JsonResponse({"item": get_full_stock_report_config(request.user)})
        )

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "reports", "change")
        if denied:
            return denied
        item = save_full_stock_report_config(request.user, parse_json(request))
        return JsonResponse({"detail": "Full stock report saved", "item": item}, status=201)

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def internal_requests(request):
    """Maneja internal requests."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "purchasing", "view")
        if denied:
            return denied
        return _handle_inventory_call(lambda: JsonResponse({"items": list_internal_requests(request.GET)}))

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "purchasing", "create")
        if denied:
            return denied
        item = create_internal_request(parse_json(request))
        return JsonResponse({"detail": "Internal request created", "item": item}, status=201)

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def purchasing_alarms(request):
    """Maneja purchasing alarms."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        denied = _require_permission(request, "purchasing", "view")
        if denied:
            return denied

        def handler():
            """Maneja handler."""
            eligible_articles = [
                {"id": item.id, "label": f"{item.name} ({item.internal_code})"}
                for item in Article.objects.filter(
                    status=Article.ArticleStatus.ACTIVE,
                    minimum_stock__isnull=False,
                ).order_by("name")[:2000]
            ]
            return JsonResponse(
                {
                    "global": get_purchasing_minimum_stock_alarm_config(request.user),
                    "rules": list_safety_stock_alerts(request.user),
                    "catalogs": {
                        "alarm_recipients": active_alarm_recipients(request.user),
                    },
                    "articles": eligible_articles,
                }
            )

        return _handle_inventory_call(handler)

    def handler():
        """Maneja handler."""
        denied = _require_permission(request, "purchasing", "change")
        if denied:
            return denied
        payload = parse_json(request)
        if payload.get("scope") == "global":
            item = save_purchasing_minimum_stock_alarm_config(request.user, payload)
            return JsonResponse({"detail": "Purchasing alarm saved", "item": item}, status=201)

        item = save_safety_stock_alert_rule(request.user, payload)
        return JsonResponse({"detail": "Purchasing rule saved", "item": item}, status=201)

    return _handle_inventory_call(handler)
