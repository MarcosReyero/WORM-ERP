from django.contrib import admin

from .models import (
    Article,
    ArticleCategory,
    AssetCheckout,
    InternalRequest,
    InternalRequestLine,
    InventoryAutomationTaskState,
    InventoryBalance,
    InventoryBatch,
    Location,
    MinimumStockDigestConfig,
    Person,
    PhysicalCountLine,
    PhysicalCountSession,
    SafetyStockAlertRule,
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


@admin.register(MinimumStockDigestConfig)
class MinimumStockDigestConfigAdmin(admin.ModelAdmin):
    list_display = ("key", "frequency", "is_enabled", "last_notified_at", "force_send_next")
    list_filter = ("frequency", "is_enabled")
    fieldsets = (
        ("Configuración General", {
            "fields": ("key", "is_enabled", "frequency", "run_at", "run_weekday")
        }),
        ("Destinatarios", {
            "fields": ("recipients", "additional_emails")
        }),
        ("Ejecución de Prueba", {
            "fields": ("force_send_next",),
            "description": "Marca 'Forzar envío próximo' para enviar el digest en el próximo ciclo del scheduler, "
                          "ignorando la configuración de horario. Se resetea automáticamente después del envío."
        }),
        ("Últimos Resultados", {
            "fields": ("last_notified_at", "last_summary_count", "last_delivery_status", "last_email_error", "last_period_key"),
            "classes": ("collapse",)
        }),
        ("Notas", {
            "fields": ("notes",),
            "classes": ("collapse",)
        }),
    )
    readonly_fields = ("last_notified_at", "last_summary_count", "last_delivery_status", "last_email_error", "last_period_key")


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


@admin.register(SafetyStockAlertRule)
class SafetyStockAlertRuleAdmin(admin.ModelAdmin):
    """Admin para reglas individuales de alertas por stock de seguridad."""
    list_display = ("article", "is_enabled", "status", "last_stock_value", "triggered_at", "last_notified_at")
    list_filter = ("is_enabled", "status", "triggered_at")
    search_fields = ("article__internal_code", "article__name")
    readonly_fields = ("triggered_at", "resolved_at", "last_notified_at", "last_email_error", "last_stock_value", "created_at", "updated_at")
    fieldsets = (
        ("Información Básica", {
            "fields": ("article", "is_enabled", "status"),
        }),
        ("Destinatarios", {
            "fields": ("recipients", "additional_emails"),
        }),
        ("Historial y Estado", {
            "fields": (
                "last_stock_value",
                "triggered_at",
                "resolved_at",
                "last_notified_at",
                "last_email_error",
            ),
        }),
        ("Notas", {
            "fields": ("notes",),
        }),
        ("Auditoría", {
            "fields": ("created_at", "updated_at", "created_by", "updated_by"),
        }),
    )


@admin.register(InventoryAutomationTaskState)
class InventoryAutomationTaskStateAdmin(admin.ModelAdmin):
    """Admin read-only para observabilidad del estado de tasks de automatización."""
    list_display = ("key", "runtime_state", "last_run_status", "last_started_at", "heartbeat_at", "lease_expires_at", "run_count")
    list_filter = ("runtime_state", "last_run_status")
    search_fields = ("key", "owner_label")
    readonly_fields = (
        "key",
        "runtime_state",
        "owner_token",
        "owner_label",
        "lease_expires_at",
        "heartbeat_at",
        "last_started_at",
        "last_finished_at",
        "last_success_at",
        "last_warning_at",
        "last_error_at",
        "last_run_status",
        "last_error_message",
        "last_warning_message",
        "run_count",
        "last_processed_count",
        "created_at",
        "updated_at",
    )
    fieldsets = (
        ("Identificación", {
            "fields": ("key", "runtime_state", "owner_label"),
        }),
        ("Lease y Heartbeat", {
            "fields": (
                "owner_token",
                "lease_expires_at",
                "heartbeat_at",
            ),
        }),
        ("Ejecución", {
            "fields": (
                "last_started_at",
                "last_finished_at",
                "last_success_at",
                "last_warning_at",
                "last_error_at",
                "last_run_status",
                "run_count",
                "last_processed_count",
            ),
        }),
        ("Mensajes", {
            "fields": (
                "last_error_message",
                "last_warning_message",
            ),
        }),
        ("Auditoría", {
            "fields": ("created_at", "updated_at"),
        }),
    )

    def has_add_permission(self, request):
        """Desabilita agregar filas manualmente."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Desabilita borrar filas."""
        return False
