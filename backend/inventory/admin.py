from django.contrib import admin

from .models import (
    Article,
    ArticleCategory,
    AssetCheckout,
    InternalRequest,
    InternalRequestLine,
    InventoryBalance,
    InventoryBatch,
    Location,
    Person,
    PhysicalCountLine,
    PhysicalCountSession,
    Sector,
    StockDiscrepancy,
    StockMovement,
    Supplier,
    TrackedUnit,
    UnitOfMeasure,
)


@admin.register(ArticleCategory)
class ArticleCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "parent", "status")
    list_filter = ("status",)
    search_fields = ("name",)


@admin.register(UnitOfMeasure)
class UnitOfMeasureAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "status")
    list_filter = ("status",)
    search_fields = ("code", "name")


@admin.register(Sector)
class SectorAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "status")
    list_filter = ("status",)
    search_fields = ("name", "code")


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ("full_name", "employee_code", "sector", "status")
    list_filter = ("status", "sector")
    search_fields = ("full_name", "employee_code", "position")


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "status", "contact")
    list_filter = ("status",)
    search_fields = ("name", "code", "contact")


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "location_type", "sector", "status")
    list_filter = ("location_type", "status", "sector")
    search_fields = ("code", "name")


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = (
        "internal_code",
        "name",
        "article_type",
        "tracking_mode",
        "status",
        "sector_responsible",
    )
    list_filter = ("article_type", "tracking_mode", "status", "sector_responsible")
    search_fields = ("internal_code", "name")


@admin.register(InventoryBatch)
class InventoryBatchAdmin(admin.ModelAdmin):
    list_display = ("article", "lot_code", "expiry_date", "quality_status")
    list_filter = ("quality_status",)
    search_fields = ("lot_code", "article__internal_code", "article__name")


@admin.register(InventoryBalance)
class InventoryBalanceAdmin(admin.ModelAdmin):
    list_display = ("article", "location", "batch", "on_hand", "reserved")
    list_filter = ("location",)
    search_fields = ("article__internal_code", "article__name", "location__code")


@admin.register(TrackedUnit)
class TrackedUnitAdmin(admin.ModelAdmin):
    list_display = ("internal_tag", "article", "status", "current_location", "current_holder_person")
    list_filter = ("status", "article__article_type", "current_location")
    search_fields = ("internal_tag", "serial_number", "article__internal_code", "article__name")


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "movement_type", "article", "quantity", "recorded_by")
    list_filter = ("movement_type", "timestamp")
    search_fields = ("article__internal_code", "article__name", "document_ref", "reason_text")


@admin.register(AssetCheckout)
class AssetCheckoutAdmin(admin.ModelAdmin):
    list_display = ("tracked_unit", "checkout_kind", "status", "receiver_person", "receiver_sector", "checked_out_at")
    list_filter = ("checkout_kind", "status")
    search_fields = ("tracked_unit__internal_tag", "receiver_person__full_name", "receiver_sector__name")


@admin.register(PhysicalCountSession)
class PhysicalCountSessionAdmin(admin.ModelAdmin):
    list_display = ("count_type", "scope", "scheduled_for", "status", "created_by")
    list_filter = ("count_type", "status")
    search_fields = ("scope",)


@admin.register(PhysicalCountLine)
class PhysicalCountLineAdmin(admin.ModelAdmin):
    list_display = ("session", "article", "location", "system_qty", "counted_qty", "review_status")
    list_filter = ("review_status",)
    search_fields = ("article__internal_code", "article__name", "location__code")


@admin.register(StockDiscrepancy)
class StockDiscrepancyAdmin(admin.ModelAdmin):
    list_display = ("article", "location", "difference_qty", "difference_type", "status", "detected_at")
    list_filter = ("difference_type", "status")
    search_fields = ("article__internal_code", "article__name", "possible_cause", "action_taken")


class InternalRequestLineInline(admin.TabularInline):
    model = InternalRequestLine
    extra = 0


@admin.register(InternalRequest)
class InternalRequestAdmin(admin.ModelAdmin):
    list_display = ("request_number", "requester", "requesting_sector", "status", "requested_at")
    list_filter = ("status", "requesting_sector")
    search_fields = ("request_number", "requester__full_name")
    inlines = [InternalRequestLineInline]
