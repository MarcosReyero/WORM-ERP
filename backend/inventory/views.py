from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from communications.services import (
    CommunicationsApiError,
    create_inventory_alarm,
    list_inventory_alarms,
)

from .models import (
    AssetCheckout,
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
    create_personal_daily_report,
    create_article,
    get_article_detail,
    get_full_stock_report_config,
    get_minimum_stock_digest_config,
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
    parse_json,
    resolve_discrepancy,
    return_checkout,
    save_minimum_stock_digest_config,
    save_full_stock_report_config,
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
    return JsonResponse({"detail": "Authentication required"}, status=401)


def _handle_inventory_call(callback):
    try:
        return callback()
    except InventoryApiError as exc:
        return JsonResponse({"detail": exc.detail}, status=exc.status)
    except CommunicationsApiError as exc:
        return JsonResponse({"detail": exc.detail}, status=exc.status)


def _request_payload(request):
    content_type = request.headers.get("Content-Type", "")
    if "application/json" in content_type:
        return parse_json(request)
    return request.POST.dict()


@require_GET
def dashboard(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    return JsonResponse(build_dashboard(request.user))


@require_GET
def inventory_overview(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    return JsonResponse(build_inventory_overview(request.user))


@require_GET
def catalogs(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    return JsonResponse(serialize_catalogs())


@require_http_methods(["GET", "POST"])
def articles(request):
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        return JsonResponse({"items": list_articles()})

    def handler():
        article = create_article(request.user, _request_payload(request), files=request.FILES)
        return JsonResponse(
            {"detail": "Article created", "id": article.id, "item": get_article_detail(article.id)["article"]},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def article_detail(request, article_id):
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        return JsonResponse(get_article_detail(article_id))

    def handler():
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
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        payload = _request_payload(request)
        mode = payload.get("mode") or "preview"
        result = import_articles_from_excel(request.user, request.FILES.get("file"), mode=mode)
        status = 201 if result["mode"] == "confirm" else 200
        detail = "Excel imported" if result["mode"] == "confirm" else "Excel analyzed"
        return JsonResponse({"detail": detail, "item": result}, status=status)

    return _handle_inventory_call(handler)


@require_GET
def article_export_excel(request):
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
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
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        items = list_personal_daily_reports(request.user)
        return JsonResponse({"items": items})

    def handler():
        report = create_personal_daily_report(request.user, _request_payload(request))
        return JsonResponse(
            {"detail": "Personal report created", "item": serialize_personal_daily_report(report)},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def personal_daily_report_detail(request, report_id):
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        report = update_personal_daily_report(request.user, report_id, _request_payload(request))
        return JsonResponse({"detail": "Personal report updated", "item": serialize_personal_daily_report(report)})

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def personal_daily_report_delete(request, report_id):
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        delete_personal_daily_report(request.user, report_id)
        return JsonResponse({"detail": "Personal report deleted"})

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def personal_daily_report_bulk_delete(request):
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
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
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        result = import_personal_daily_reports_from_excel(request.user, request.FILES.get("file"))
        return JsonResponse({"detail": "Excel imported", "item": result}, status=201)

    return _handle_inventory_call(handler)


@require_GET
def balances(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    items = [
        serialize_balance(balance)
        for balance in InventoryBalance.objects.select_related("article", "location", "batch")
        .order_by("article__name", "location__name")
    ]
    return JsonResponse({"items": items})


@require_GET
def batches(request):
    if not request.user.is_authenticated:
        return _unauthorized()
    items = [
        serialize_batch(batch)
        for batch in InventoryBatch.objects.select_related("article", "supplier")
        .order_by("article__name", "lot_code")
    ]
    return JsonResponse({"items": items})


@require_GET
def tracked_units(request):
    if not request.user.is_authenticated:
        return _unauthorized()
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
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
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
        movement = create_movement(request.user, parse_json(request))
        return JsonResponse(
            {"detail": "Movement registered", "item": serialize_movement(movement)},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def checkouts(request):
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
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
        checkout = create_checkout(request.user, parse_json(request))
        return JsonResponse(
            {"detail": "Checkout registered", "item": serialize_checkout(checkout)},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def checkout_return(request, checkout_id):
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        checkout = return_checkout(request.user, checkout_id, parse_json(request))
        return JsonResponse({"detail": "Checkout returned", "item": serialize_checkout(checkout)})

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def count_sessions(request):
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        items = [
            serialize_count_session(session)
            for session in PhysicalCountSession.objects.prefetch_related("lines")
            .order_by("-scheduled_for")
        ]
        return JsonResponse({"items": items})

    def handler():
        session = create_count_session(request.user, parse_json(request))
        return JsonResponse(
            {"detail": "Count session created", "item": serialize_count_session(session)},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def count_session_lines(request, session_id):
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
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
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
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
        discrepancy = create_discrepancy(request.user, parse_json(request))
        return JsonResponse(
            {"detail": "Discrepancy registered", "item": serialize_discrepancy(discrepancy)},
            status=201,
        )

    return _handle_inventory_call(handler)


@require_http_methods(["POST"])
def discrepancy_resolve(request, discrepancy_id):
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        discrepancy = resolve_discrepancy(request.user, discrepancy_id, parse_json(request))
        return JsonResponse(
            {"detail": "Discrepancy resolved", "item": serialize_discrepancy(discrepancy)}
        )

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def inventory_alarms(request):
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        return _handle_inventory_call(
            lambda: JsonResponse({"items": list_inventory_alarms(request.user)})
        )

    def handler():
        item = create_inventory_alarm(request.user, parse_json(request))
        return JsonResponse({"detail": "Alarm created", "item": item}, status=201)

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def inventory_safety_alerts(request):
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        return _handle_inventory_call(
            lambda: JsonResponse({"items": list_safety_stock_alerts(request.user)})
        )

    def handler():
        item = save_safety_stock_alert_rule(request.user, parse_json(request))
        return JsonResponse({"detail": "Safety alert saved", "item": item}, status=201)

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def inventory_minimum_stock_digest(request):
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        return _handle_inventory_call(
            lambda: JsonResponse({"item": get_minimum_stock_digest_config(request.user)})
        )

    def handler():
        item = save_minimum_stock_digest_config(request.user, parse_json(request))
        return JsonResponse({"detail": "Minimum stock digest saved", "item": item}, status=201)

    return _handle_inventory_call(handler)


@require_http_methods(["GET", "POST"])
def inventory_full_stock_report(request):
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        return _handle_inventory_call(
            lambda: JsonResponse({"item": get_full_stock_report_config(request.user)})
        )

    def handler():
        item = save_full_stock_report_config(request.user, parse_json(request))
        return JsonResponse({"detail": "Full stock report saved", "item": item}, status=201)

    return _handle_inventory_call(handler)
