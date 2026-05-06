import re
from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from accounts.models import UserProfile
from accounts.permissions import has_module_permission

from .models import (
    Article,
    InventoryBatch,
    Location,
    Pallet,
    PalletEvent,
    StoragePosition,
    StorageZone,
    StockMovement,
)
from .services import (
    InventoryApiError,
    clean_string,
    create_movement,
    parse_decimal,
    parse_optional_int,
    resolve_instance,
    save_validated,
    serialize_catalogs,
    serialize_datetime,
    serialize_decimal,
    update_audit,
)


DEPOSIT_VIEW_ROLES = {
    UserProfile.Role.ADMINISTRATOR,
    UserProfile.Role.STOREKEEPER,
    UserProfile.Role.SUPERVISOR,
    UserProfile.Role.OPERATOR,
    UserProfile.Role.AUDITOR,
}
DEPOSIT_MANAGER_ROLES = {
    UserProfile.Role.ADMINISTRATOR,
    UserProfile.Role.STOREKEEPER,
}
DEPOSIT_SCAN_ROLES = {
    UserProfile.Role.ADMINISTRATOR,
    UserProfile.Role.STOREKEEPER,
    UserProfile.Role.SUPERVISOR,
    UserProfile.Role.OPERATOR,
}
DEPOSIT_MODULE_CODES = {
    "overview": "deposits_overview",
    "registry": "pallet_registry",
    "layout": "deposit_layout",
    "scans": "pallet_scans",
}
PALLET_CODE_PREFIX = "PAL"
PALLET_REGISTRY_CODE_PATTERN = re.compile(r"^CP\s*(?:N[º°o]?\s*)?(\d{3})$", re.IGNORECASE)
PALLET_LOT_PATTERN = re.compile(r"^\d{4}$")
DEPOSIT_LOCATION_TYPES = {
    Location.LocationType.WAREHOUSE,
    Location.LocationType.TOOLROOM,
}


def get_deposit_profile(user):
    defaults = {
        "role": UserProfile.Role.ADMINISTRATOR if user.is_superuser else UserProfile.Role.OPERATOR,
    }
    return UserProfile.objects.get_or_create(user=user, defaults=defaults)[0]


def _can(user, module_code, action_code):
    return user.is_superuser or has_module_permission(user, module_code, action_code)


def resolve_deposit_permissions(user):
    can_view_registry = _can(user, DEPOSIT_MODULE_CODES["registry"], "view")
    can_manage_registry = (
        _can(user, DEPOSIT_MODULE_CODES["registry"], "create")
        or _can(user, DEPOSIT_MODULE_CODES["registry"], "change")
        or _can(user, DEPOSIT_MODULE_CODES["registry"], "delete")
    )
    can_view_layout = _can(user, DEPOSIT_MODULE_CODES["layout"], "view")
    can_manage_layout = (
        _can(user, DEPOSIT_MODULE_CODES["layout"], "create")
        or _can(user, DEPOSIT_MODULE_CODES["layout"], "change")
        or _can(user, DEPOSIT_MODULE_CODES["layout"], "delete")
    )
    can_scan = _can(user, DEPOSIT_MODULE_CODES["scans"], "create")
    can_view_module = (
        _can(user, DEPOSIT_MODULE_CODES["overview"], "view")
        or can_view_registry
        or can_view_layout
        or can_scan
    )

    return {
        "can_view_module": can_view_module,
        "can_view_registry": can_view_registry,
        "can_manage_registry": can_manage_registry,
        "can_view_layout": can_view_layout,
        "can_manage_layout": can_manage_layout,
        "can_scan": can_scan,
        "can_register_via_scan": can_manage_registry,
    }


def require_deposit_access(user):
    permissions = resolve_deposit_permissions(user)
    if get_deposit_profile(user).status != UserProfile.Status.ACTIVE:
        raise InventoryApiError("User profile is inactive", status=403)
    if not permissions["can_view_module"]:
        raise InventoryApiError("You do not have permission for Depositos", status=403)
    return permissions


def require_registry_view(user):
    permissions = require_deposit_access(user)
    if not permissions["can_view_registry"]:
        raise InventoryApiError("You do not have permission to view pallet registry", status=403)
    return permissions


def require_registry_manage(user):
    permissions = require_registry_view(user)
    if not permissions["can_manage_registry"]:
        raise InventoryApiError("You do not have permission to manage pallets", status=403)
    return permissions


def require_layout_view(user):
    permissions = require_deposit_access(user)
    if not permissions["can_view_layout"]:
        raise InventoryApiError("You do not have permission to view deposit layout", status=403)
    return permissions


def require_scan_access(user):
    permissions = require_deposit_access(user)
    if not permissions["can_scan"]:
        raise InventoryApiError("You do not have permission to scan pallets", status=403)
    return permissions


def deposit_locations_queryset():
    return Location.objects.filter(
        status="active",
        location_type__in=DEPOSIT_LOCATION_TYPES,
    ).order_by("name")


def ensure_deposit_location(location):
    if location.location_type not in DEPOSIT_LOCATION_TYPES:
        raise InventoryApiError("The selected location is not enabled as a deposit", status=400)


def _next_pallet_code():
    pattern = re.compile(rf"^{PALLET_CODE_PREFIX}-(\d+)$")
    max_number = 0
    for code in Pallet.objects.filter(pallet_code__startswith=f"{PALLET_CODE_PREFIX}-").values_list(
        "pallet_code",
        flat=True,
    ):
        match = pattern.match(code or "")
        if match:
            max_number = max(max_number, int(match.group(1)))
    return f"{PALLET_CODE_PREFIX}-{max_number + 1:06d}"


def serialize_article_option(article):
    return {
        "id": article.id,
        "name": article.name,
        "internal_code": article.internal_code,
    }


def serialize_location_option(location):
    return {
        "id": location.id,
        "code": location.code,
        "name": location.name,
        "location_type": location.location_type,
        "location_type_label": location.get_location_type_display(),
    }


def serialize_position_option(position):
    return {
        "id": position.id,
        "code": position.code,
        "zone_id": position.zone_id,
        "zone": position.zone.name,
        "location_id": position.zone.location_id,
        "location": position.zone.location.name,
        "status": position.status,
        "status_label": position.get_status_display(),
        "capacity_pallets": position.capacity_pallets,
    }


def serialize_pallet(pallet):
    return {
        "id": pallet.id,
        "pallet_code": pallet.pallet_code,
        "qr_value": pallet.qr_value,
        "pallet_type": pallet.pallet_type,
        "pallet_lot": pallet.pallet_lot,
        "article": pallet.article.name if pallet.article else None,
        "article_id": pallet.article_id,
        "quantity": serialize_decimal(pallet.quantity) if pallet.quantity is not None else None,
        "batch": pallet.batch.lot_code if pallet.batch else None,
        "batch_id": pallet.batch_id,
        "location": pallet.location.name,
        "location_id": pallet.location_id,
        "position": pallet.position.code if pallet.position_id else None,
        "position_id": pallet.position_id,
        "zone": pallet.position.zone.name if pallet.position_id else None,
        "zone_id": pallet.position.zone_id if pallet.position_id else None,
        "status": pallet.status,
        "status_label": pallet.get_status_display(),
        "notes": pallet.notes,
        "last_scanned_at": serialize_datetime(pallet.last_scanned_at),
        "created_at": serialize_datetime(pallet.created_at),
        "updated_at": serialize_datetime(pallet.updated_at),
    }


def serialize_pallet_event(event):
    return {
        "id": event.id,
        "created_at": serialize_datetime(event.created_at),
        "event_type": event.event_type,
        "event_type_label": event.get_event_type_display(),
        "input_method": event.input_method,
        "input_method_label": event.get_input_method_display(),
        "pallet_id": event.pallet_id,
        "pallet_code": event.pallet.pallet_code,
        "raw_qr": event.raw_qr,
        "recorded_by": event.recorded_by.username,
        "source_position": event.source_position.code if event.source_position else None,
        "source_location": (
            event.source_position.zone.location.name if event.source_position else None
        ),
        "target_position": event.target_position.code if event.target_position else None,
        "target_location": (
            event.target_position.zone.location.name if event.target_position else None
        ),
        "notes": event.notes,
    }


def _active_pallets_for_position(position_id, exclude_pallet_id=None):
    queryset = Pallet.objects.filter(position_id=position_id).exclude(status=Pallet.PalletStatus.ARCHIVED)
    if exclude_pallet_id:
        queryset = queryset.exclude(pk=exclude_pallet_id)
    return queryset


def ensure_position_available(position, exclude_pallet_id=None):
    if position.status == StoragePosition.PositionStatus.BLOCKED:
        raise InventoryApiError("The target position is blocked", status=400)

    occupied_count = _active_pallets_for_position(position.id, exclude_pallet_id=exclude_pallet_id).count()
    if occupied_count >= position.capacity_pallets:
        raise InventoryApiError("The target position is already at full pallet capacity", status=400)


def normalize_registry_pallet_code(value):
    raw = clean_string(value)
    match = PALLET_REGISTRY_CODE_PATTERN.match(raw)
    if not match:
        raise InventoryApiError("Invalid pallet code format. Expected: CP Nº 000", status=400)
    digits = match.group(1)
    return f"CP Nº {digits}"


def normalize_registry_lot(value):
    raw = clean_string(value)
    if not PALLET_LOT_PATTERN.match(raw):
        raise InventoryApiError("Invalid lot format. Expected 4 digits (e.g. 2605)", status=400)
    return raw


def choose_available_position(location):
    positions = (
        StoragePosition.objects.select_related("zone", "zone__location")
        .filter(zone__location=location)
        .exclude(status=StoragePosition.PositionStatus.BLOCKED)
        .order_by("zone__sort_order", "code")
    )
    for position in positions:
        try:
            ensure_position_available(position)
        except InventoryApiError:
            continue
        return position
    raise InventoryApiError("No available positions in the selected location", status=400)


def sync_position_statuses(position_ids):
    normalized_ids = [position_id for position_id in dict.fromkeys(position_ids) if position_id]
    if not normalized_ids:
        return

    positions = StoragePosition.objects.filter(pk__in=normalized_ids)
    for position in positions:
        if position.status == StoragePosition.PositionStatus.BLOCKED:
            continue

        occupied = _active_pallets_for_position(position.id).exists()
        next_status = (
            StoragePosition.PositionStatus.OCCUPIED
            if occupied
            else StoragePosition.PositionStatus.AVAILABLE
        )
        if position.status != next_status:
            position.status = next_status
            position.save(update_fields=["status", "updated_at"])


def resolve_existing_batch(article, payload):
    batch_id = parse_optional_int(payload.get("batch_id"), "batch_id")
    if batch_id is None:
        return None
    batch = get_object_or_404(InventoryBatch, pk=batch_id)
    if batch.article_id != article.id:
        raise InventoryApiError("The selected batch does not belong to the article")
    return batch


def resolve_pallet_by_qr(qr_value):
    normalized_qr = clean_string(qr_value)
    if not normalized_qr:
        raise InventoryApiError("qr_value is required")

    registry_match = PALLET_REGISTRY_CODE_PATTERN.match(normalized_qr)
    registry_normalized = None
    if registry_match:
        registry_normalized = f"CP Nº {registry_match.group(1)}"

    pallet = (
        Pallet.objects.select_related("article", "batch", "location", "position__zone")
        .filter(qr_value__iexact=normalized_qr)
        .first()
    )
    if pallet:
        return pallet
    if registry_normalized and registry_normalized != normalized_qr:
        pallet = (
            Pallet.objects.select_related("article", "batch", "location", "position__zone")
            .filter(qr_value__iexact=registry_normalized)
            .first()
        )
        if pallet:
            return pallet

    pallet = (
        Pallet.objects.select_related("article", "batch", "location", "position__zone")
        .filter(pallet_code__iexact=normalized_qr)
        .first()
    )
    if pallet:
        return pallet
    if registry_normalized and registry_normalized != normalized_qr:
        pallet = (
            Pallet.objects.select_related("article", "batch", "location", "position__zone")
            .filter(pallet_code__iexact=registry_normalized)
            .first()
        )
        if pallet:
            return pallet

    raise InventoryApiError("Pallet not found", status=404)


def record_pallet_event(
    pallet,
    user,
    event_type,
    input_method=PalletEvent.InputMethod.MANUAL,
    source_position=None,
    target_position=None,
    raw_qr="",
    notes="",
):
    event = PalletEvent(
        pallet=pallet,
        event_type=event_type,
        input_method=input_method or PalletEvent.InputMethod.MANUAL,
        source_position=source_position,
        target_position=target_position,
        recorded_by=user,
        raw_qr=clean_string(raw_qr),
        notes=clean_string(notes),
    )
    update_audit(event, user, is_new=True)
    save_validated(event)
    return event


def _touch_pallet_scan(pallet, user):
    pallet.last_scanned_at = timezone.now()
    update_audit(pallet, user)
    save_validated(pallet)
    return pallet


def list_pallets(user, query_params=None):
    require_registry_view(user)
    query_params = query_params or {}

    queryset = Pallet.objects.select_related("article", "batch", "location", "position__zone").order_by(
        "-updated_at",
        "-id",
    )

    location_id = parse_optional_int(query_params.get("location_id"), "location_id")
    if location_id is not None:
        queryset = queryset.filter(location_id=location_id)

    position_id = parse_optional_int(query_params.get("position_id"), "position_id")
    if position_id is not None:
        queryset = queryset.filter(position_id=position_id)

    status = clean_string(query_params.get("status"))
    if status and status != "all":
        queryset = queryset.filter(status=status)

    query = clean_string(query_params.get("q") or query_params.get("query"))
    if query:
        queryset = queryset.filter(
            Q(article__name__icontains=query)
            | Q(pallet_code__icontains=query)
            | Q(qr_value__icontains=query)
            | Q(pallet_type__icontains=query)
            | Q(pallet_lot__icontains=query)
            | Q(position__code__icontains=query)
            | Q(location__name__icontains=query)
        )

    return [serialize_pallet(item) for item in queryset[:200]]


def get_pallet_detail(user, pallet_id):
    require_registry_view(user)
    pallet = get_object_or_404(
        Pallet.objects.select_related("article", "batch", "location", "position__zone"),
        pk=pallet_id,
    )
    events = [
        serialize_pallet_event(event)
        for event in pallet.events.select_related(
            "recorded_by",
            "source_position__zone__location",
            "target_position__zone__location",
            "pallet",
        ).all()[:25]
    ]
    return {
        "item": serialize_pallet(pallet),
        "events": events,
    }


def create_pallet(user, payload, *, input_method=PalletEvent.InputMethod.MANUAL, scanned_qr=""):
    require_registry_manage(user)

    raw_qr = clean_string(scanned_qr or payload.get("qr_value"))
    notes = clean_string(payload.get("notes"))

    pallet_type = clean_string(payload.get("pallet_type") or payload.get("type"))
    if pallet_type:
        if not raw_qr:
            raise InventoryApiError("qr_value is required", status=400)

        pallet_code = normalize_registry_pallet_code(raw_qr or payload.get("pallet_code"))
        pallet_lot = normalize_registry_lot(payload.get("pallet_lot") or payload.get("lot"))

        location = resolve_instance(
            Location,
            payload.get("location_id"),
            "location",
            required=False,
        ) or get_default_location()
        ensure_deposit_location(location)

        position = resolve_instance(
            StoragePosition,
            payload.get("position_id"),
            "position",
            required=False,
        ) or choose_available_position(location)
        ensure_deposit_location(position.zone.location)
        if position.zone.location_id != location.id:
            raise InventoryApiError("The selected position does not belong to the target location")

        with transaction.atomic():
            pallet = Pallet(
                pallet_code=pallet_code,
                qr_value=pallet_code,
                pallet_type=pallet_type,
                pallet_lot=pallet_lot,
                article=None,
                batch=None,
                quantity=None,
                location=location,
                position=position,
                status=Pallet.PalletStatus.ACTIVE,
                notes=notes,
                last_scanned_at=timezone.now(),
            )
            update_audit(pallet, user, is_new=True)
            save_validated(pallet)

            record_pallet_event(
                pallet,
                user,
                PalletEvent.EventType.REGISTERED,
                input_method=input_method,
                target_position=position,
                raw_qr=raw_qr,
                notes=notes,
            )
            sync_position_statuses([position.id])

        return pallet

    article = resolve_instance(Article, payload.get("article_id"), "article")
    batch = resolve_existing_batch(article, payload)
    quantity = parse_decimal(payload.get("quantity"), "quantity")
    position = resolve_instance(StoragePosition, payload.get("position_id"), "position")
    location = resolve_instance(
        Location,
        payload.get("location_id"),
        "location",
        required=False,
    ) or position.zone.location

    ensure_deposit_location(location)
    ensure_deposit_location(position.zone.location)
    if position.zone.location_id != location.id:
        raise InventoryApiError("The selected position does not belong to the target location")

    ensure_position_available(position)

    pallet_code = _next_pallet_code()

    with transaction.atomic():
        pallet = Pallet(
            pallet_code=pallet_code,
            qr_value=pallet_code,
            article=article,
            batch=batch,
            quantity=quantity,
            location=location,
            position=position,
            status=Pallet.PalletStatus.ACTIVE,
            notes=notes,
            last_scanned_at=timezone.now() if raw_qr else None,
        )
        update_audit(pallet, user, is_new=True)
        save_validated(pallet)

        record_pallet_event(
            pallet,
            user,
            PalletEvent.EventType.REGISTERED,
            input_method=input_method,
            target_position=position,
            raw_qr=raw_qr,
            notes=notes,
        )

        movement_payload = {
            "article_id": article.id,
            "movement_type": StockMovement.MovementType.ADJUSTMENT_IN,
            "quantity": quantity,
            "target_location_id": location.id,
            "reason_text": f"Alta de pallet {pallet.pallet_code}",
            "notes": notes or f"Pallet {pallet.pallet_code} registrado en Depositos",
        }
        if batch:
            movement_payload["batch_id"] = batch.id
        create_movement(user, movement_payload, allow_initial_load=True)
        sync_position_statuses([position.id])

    return pallet


def update_pallet(user, pallet_id, payload):
    require_registry_manage(user)
    pallet = get_object_or_404(
        Pallet.objects.select_related("article", "batch", "location", "position__zone"),
        pk=pallet_id,
    )

    status = clean_string(payload.get("status"))
    if status and status in {choice for choice, _ in Pallet.PalletStatus.choices}:
        pallet.status = status

    if "notes" in payload:
        pallet.notes = clean_string(payload.get("notes"))

    update_audit(pallet, user)
    save_validated(pallet)
    sync_position_statuses([pallet.position_id])
    return pallet


def relocate_pallet(user, pallet, target_position, *, input_method, raw_qr="", notes=""):
    if pallet.status == Pallet.PalletStatus.ARCHIVED:
        raise InventoryApiError("Archived pallets cannot be relocated", status=400)

    if target_position.id == pallet.position_id:
        raise InventoryApiError("The pallet is already in the selected position", status=400)

    ensure_position_available(target_position, exclude_pallet_id=pallet.id)

    source_position = pallet.position
    source_location = pallet.location
    target_location = target_position.zone.location

    with transaction.atomic():
        if (
            source_location.id != target_location.id
            and pallet.article_id
            and pallet.quantity is not None
        ):
            movement_payload = {
                "article_id": pallet.article_id,
                "movement_type": StockMovement.MovementType.TRANSFER,
                "quantity": pallet.quantity,
                "source_location_id": source_location.id,
                "target_location_id": target_location.id,
                "reason_text": f"Traslado de pallet {pallet.pallet_code}",
                "notes": notes or f"Transferencia de pallet {pallet.pallet_code} entre depositos",
            }
            if pallet.batch_id:
                movement_payload["batch_id"] = pallet.batch_id
            create_movement(user, movement_payload, bypass_role_check=True)

        pallet.location = target_location
        pallet.position = target_position
        pallet.status = Pallet.PalletStatus.ACTIVE
        pallet.last_scanned_at = timezone.now()
        if notes:
            pallet.notes = clean_string(notes)
        update_audit(pallet, user)
        save_validated(pallet)

        record_pallet_event(
            pallet,
            user,
            PalletEvent.EventType.RELOCATED,
            input_method=input_method,
            source_position=source_position,
            target_position=target_position,
            raw_qr=raw_qr,
            notes=notes,
        )
        sync_position_statuses([source_position.id, target_position.id])

    return pallet


def scan_pallet(user, payload):
    permissions = require_scan_access(user)

    action = clean_string(payload.get("action")).lower()
    qr_value = clean_string(payload.get("qr_value"))
    input_method = clean_string(payload.get("input_method")) or PalletEvent.InputMethod.MANUAL
    notes = clean_string(payload.get("notes"))

    if action not in {"lookup", "register", "relocate"}:
        raise InventoryApiError("Unsupported scan action")

    if action == "register":
        if not permissions["can_register_via_scan"]:
            raise InventoryApiError("You do not have permission to register pallets via scan", status=403)

        registry_type = clean_string(payload.get("pallet_type") or payload.get("type"))
        normalized_qr = normalize_registry_pallet_code(qr_value) if registry_type else qr_value

        if normalized_qr:
            try:
                resolve_pallet_by_qr(normalized_qr)
            except InventoryApiError as exc:
                if exc.status != 404:
                    raise
            else:
                raise InventoryApiError("The scanned pallet code already exists", status=400)

        if registry_type:
            payload = {**payload, "qr_value": normalized_qr}
        pallet = create_pallet(user, payload, input_method=input_method, scanned_qr=normalized_qr)
        return {
            "action": action,
            "item": serialize_pallet(pallet),
            "detail": "Pallet registered from scan",
        }

    pallet = resolve_pallet_by_qr(qr_value)

    if action == "lookup":
        with transaction.atomic():
            _touch_pallet_scan(pallet, user)
            record_pallet_event(
                pallet,
                user,
                PalletEvent.EventType.SCANNED_LOOKUP,
                input_method=input_method,
                target_position=pallet.position,
                raw_qr=qr_value,
                notes=notes,
            )
        return {
            "action": action,
            "item": serialize_pallet(pallet),
            "detail": "Pallet located",
        }

    target_position = resolve_instance(StoragePosition, payload.get("position_id"), "position")
    relocated = relocate_pallet(
        user,
        pallet,
        target_position,
        input_method=input_method,
        raw_qr=qr_value,
        notes=notes,
    )
    return {
        "action": action,
        "item": serialize_pallet(relocated),
        "detail": "Pallet relocated",
    }


def serialize_position_layout(position, active_pallets_by_position):
    pallets = active_pallets_by_position.get(position.id, [])
    current_pallet = pallets[0] if pallets else None
    return {
        "id": position.id,
        "code": position.code,
        "zone_id": position.zone_id,
        "zone": position.zone.name,
        "location_id": position.zone.location_id,
        "status": position.status,
        "status_label": position.get_status_display(),
        "capacity_pallets": position.capacity_pallets,
        "x": serialize_decimal(position.x),
        "y": serialize_decimal(position.y),
        "width": serialize_decimal(position.width),
        "height": serialize_decimal(position.height),
        "occupancy_count": len(pallets),
        "occupancy_ratio": (
            round(len(pallets) / position.capacity_pallets, 3)
            if position.capacity_pallets
            else 0
        ),
        "current_pallet": serialize_pallet(current_pallet) if current_pallet else None,
        "current_pallets": [serialize_pallet(pallet) for pallet in pallets],
    }


def build_deposit_layout(user, location_id):
    permissions = require_layout_view(user)
    location = get_object_or_404(deposit_locations_queryset(), pk=location_id)
    zones = list(
        StorageZone.objects.filter(location=location)
        .prefetch_related("positions")
        .order_by("sort_order", "code")
    )
    positions = list(
        StoragePosition.objects.select_related("zone", "zone__location")
        .filter(zone__location=location)
        .order_by("zone__sort_order", "code")
    )
    pallets = list(
        Pallet.objects.select_related("article", "batch", "location", "position__zone")
        .filter(location=location)
        .exclude(status=Pallet.PalletStatus.ARCHIVED)
        .order_by("position__zone__sort_order", "position__code", "-updated_at")
    )

    active_pallets_by_position = defaultdict(list)
    for pallet in pallets:
        active_pallets_by_position[pallet.position_id].append(pallet)

    serialized_positions = [
        serialize_position_layout(position, active_pallets_by_position)
        for position in positions
    ]
    positions_by_zone = defaultdict(list)
    for item in serialized_positions:
        positions_by_zone[item["zone_id"]].append(item)

    return {
        "deposit": serialize_location_option(location),
        "permissions": permissions,
        "zones": [
            {
                "id": zone.id,
                "code": zone.code,
                "name": zone.name,
                "color": zone.color,
                "sort_order": zone.sort_order,
                "positions": positions_by_zone.get(zone.id, []),
            }
            for zone in zones
        ],
        "positions": serialized_positions,
    }


def build_deposits_overview(user):
    permissions = require_deposit_access(user)
    locations = list(deposit_locations_queryset())
    location_ids = [location.id for location in locations]
    pallets_queryset = (
        Pallet.objects.select_related("article", "batch", "location", "position__zone")
        .filter(location_id__in=location_ids)
        .order_by("-updated_at", "-id")
    )
    events_queryset = (
        PalletEvent.objects.select_related(
            "pallet",
            "recorded_by",
            "source_position__zone__location",
            "target_position__zone__location",
        )
        .filter(pallet__location_id__in=location_ids)
        .order_by("-created_at", "-id")
    )
    positions = StoragePosition.objects.select_related("zone", "zone__location").filter(
        zone__location_id__in=location_ids
    )

    today = timezone.localdate()
    pallet_counts = dict(
        Pallet.objects.filter(location_id__in=location_ids).exclude(status=Pallet.PalletStatus.ARCHIVED)
        .values_list("location_id")
        .annotate(total=Count("id"))
    )
    occupied_counts = dict(
        StoragePosition.objects.filter(
            zone__location_id__in=location_ids,
            status=StoragePosition.PositionStatus.OCCUPIED,
        )
        .values_list("zone__location_id")
        .annotate(total=Count("id"))
    )
    position_counts = dict(
        StoragePosition.objects.filter(zone__location_id__in=location_ids)
        .values_list("zone__location_id")
        .annotate(total=Count("id"))
    )

    recent_pallets = [serialize_pallet(item) for item in pallets_queryset[:20]]
    recent_events = [serialize_pallet_event(item) for item in events_queryset[:20]]
    quantity_articles = Article.objects.filter(tracking_mode=Article.TrackingMode.QUANTITY).order_by("name")
    location_options = [serialize_location_option(location) for location in locations]

    return {
        "header": {
            "title": "Depositos",
            "subtitle": "Registro, plano fisico y escaneo QR sobre stock real.",
        },
        "stats": [
            {
                "label": "Pallets activos",
                "value": pallets_queryset.exclude(status=Pallet.PalletStatus.ARCHIVED).count(),
                "hint": "Pallets vigentes con ubicacion fisica",
            },
            {
                "label": "Posiciones ocupadas",
                "value": positions.filter(status=StoragePosition.PositionStatus.OCCUPIED).count(),
                "hint": "Con al menos un pallet activo",
            },
            {
                "label": "Eventos hoy",
                "value": events_queryset.filter(created_at__date=today).count(),
                "hint": "Registro, reubicacion y consulta",
            },
            {
                "label": "Depositos activos",
                "value": len(locations),
                "hint": "Ubicaciones de alto nivel disponibles",
            },
        ],
        "permissions": permissions,
        "catalogs": {
            **serialize_catalogs(),
            "articles": [serialize_article_option(article) for article in quantity_articles],
            "batches": [
                {
                    "id": batch.id,
                    "article_id": batch.article_id,
                    "lot_code": batch.lot_code,
                }
                for batch in InventoryBatch.objects.select_related("article").order_by("article__name", "lot_code")
            ],
            "positions": [serialize_position_option(position) for position in positions.order_by("zone__sort_order", "code")],
            "scan_actions": [
                {"value": "lookup", "label": "Consultar"},
                {"value": "register", "label": "Registrar"},
                {"value": "relocate", "label": "Reubicar"},
            ],
            "pallet_statuses": [
                {"value": value, "label": label} for value, label in Pallet.PalletStatus.choices
            ],
            "event_types": [
                {"value": value, "label": label} for value, label in PalletEvent.EventType.choices
            ],
            "input_methods": [
                {"value": value, "label": label} for value, label in PalletEvent.InputMethod.choices
            ],
            "position_statuses": [
                {"value": value, "label": label}
                for value, label in StoragePosition.PositionStatus.choices
            ],
        },
        "locations": [
            {
                **location,
                "position_count": position_counts.get(location["id"], 0),
                "occupied_position_count": occupied_counts.get(location["id"], 0),
                "active_pallet_count": pallet_counts.get(location["id"], 0),
            }
            for location in location_options
        ],
        "pallets_recent": recent_pallets,
        "events_recent": recent_events,
    }
