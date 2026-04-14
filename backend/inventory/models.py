from django.conf import settings
from django.core.exceptions import ValidationError
from datetime import time

from django.core.validators import FileExtensionValidator, MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


class AuditedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(app_label)s_%(class)s_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(app_label)s_%(class)s_updated",
    )

    class Meta:
        abstract = True


class StatusCatalog(models.TextChoices):
    ACTIVE = "active", "Activo"
    INACTIVE = "inactive", "Inactivo"


class ArticleCategory(AuditedModel):
    name = models.CharField(max_length=120, unique=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
    )
    status = models.CharField(
        max_length=16,
        choices=StatusCatalog.choices,
        default=StatusCatalog.ACTIVE,
    )
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Categoria de articulo"
        verbose_name_plural = "Categorias de articulos"

    def __str__(self):
        return self.name


class UnitOfMeasure(AuditedModel):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=80)
    status = models.CharField(
        max_length=16,
        choices=StatusCatalog.choices,
        default=StatusCatalog.ACTIVE,
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Unidad de medida"
        verbose_name_plural = "Unidades de medida"

    def __str__(self):
        return f"{self.name} ({self.code})"


class Sector(AuditedModel):
    name = models.CharField(max_length=120, unique=True)
    status = models.CharField(
        max_length=16,
        choices=StatusCatalog.choices,
        default=StatusCatalog.ACTIVE,
    )
    code = models.CharField(max_length=30, unique=True, null=True, blank=True)
    observations = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Person(AuditedModel):
    full_name = models.CharField(max_length=160)
    status = models.CharField(
        max_length=16,
        choices=StatusCatalog.choices,
        default=StatusCatalog.ACTIVE,
    )
    employee_code = models.CharField(max_length=40, blank=True)
    sector = models.ForeignKey(
        Sector,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="people",
    )
    position = models.CharField(max_length=120, blank=True)
    supervisor = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="team_members",
    )
    digital_signature = models.CharField(max_length=255, blank=True)
    observations = models.TextField(blank=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return self.full_name


class Supplier(AuditedModel):
    name = models.CharField(max_length=160, unique=True)
    status = models.CharField(
        max_length=16,
        choices=StatusCatalog.choices,
        default=StatusCatalog.ACTIVE,
    )
    code = models.CharField(max_length=40, unique=True, null=True, blank=True)
    contact = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    observations = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Location(AuditedModel):
    class LocationType(models.TextChoices):
        WAREHOUSE = "warehouse", "Deposito"
        TOOLROOM = "toolroom", "Panol"
        PRODUCTION = "production", "Produccion"
        QUALITY = "quality", "Calidad"
        QUARANTINE = "quarantine", "Cuarentena"
        MAINTENANCE = "maintenance", "Mantenimiento"
        OTHER = "other", "Otra"

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=120)
    location_type = models.CharField(max_length=24, choices=LocationType.choices)
    status = models.CharField(
        max_length=16,
        choices=StatusCatalog.choices,
        default=StatusCatalog.ACTIVE,
    )
    sector = models.ForeignKey(
        Sector,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="locations",
    )
    responsible = models.ForeignKey(
        Person,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="responsible_locations",
    )
    observations = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class Article(AuditedModel):
    class ArticleType(models.TextChoices):
        CONSUMABLE = "consumable", "Consumible"
        INPUT = "input", "Insumo productivo"
        TOOL = "tool", "Herramienta"
        SPARE_PART = "spare_part", "Repuesto"
        PPE = "ppe", "Elemento de proteccion personal"

    class TrackingMode(models.TextChoices):
        QUANTITY = "quantity", "Por cantidad"
        UNIT = "unit", "Por unidad"

    class ArticleStatus(models.TextChoices):
        ACTIVE = "active", "Activo"
        INACTIVE = "inactive", "Inactivo"
        DISCONTINUED = "discontinued", "Descontinuado"

    internal_code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=160)
    image = models.FileField(
        upload_to="article-images/",
        null=True,
        blank=True,
        validators=[FileExtensionValidator(["jpg", "jpeg", "png", "webp", "gif"])],
    )
    article_type = models.CharField(max_length=24, choices=ArticleType.choices)
    unit_of_measure = models.ForeignKey(
        UnitOfMeasure,
        on_delete=models.PROTECT,
        related_name="articles",
    )
    status = models.CharField(
        max_length=16,
        choices=ArticleStatus.choices,
        default=ArticleStatus.ACTIVE,
    )
    sector_responsible = models.ForeignKey(
        Sector,
        on_delete=models.PROTECT,
        related_name="responsible_articles",
    )
    tracking_mode = models.CharField(
        max_length=16,
        choices=TrackingMode.choices,
        default=TrackingMode.QUANTITY,
    )
    description = models.TextField(blank=True)
    category = models.ForeignKey(
        ArticleCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="articles",
    )
    subcategory = models.ForeignKey(
        ArticleCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subcategory_articles",
    )
    primary_location = models.ForeignKey(
        Location,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="primary_articles",
    )
    observations = models.TextField(blank=True)
    minimum_stock = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )
    safety_stock = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )
    reorder_point = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )
    max_stock = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )
    suggested_purchase_qty = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="articles",
    )
    reference_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    lead_time_days = models.PositiveIntegerField(null=True, blank=True)
    last_purchase = models.DateField(null=True, blank=True)
    requires_lot = models.BooleanField(default=False)
    requires_expiry = models.BooleanField(default=False)
    requires_serial = models.BooleanField(default=False)
    requires_size = models.BooleanField(default=False)
    requires_quality = models.BooleanField(default=False)
    requires_assignee = models.BooleanField(default=False)
    is_critical = models.BooleanField(default=False)
    loanable = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.internal_code})"

    def clean(self):
        quantity_controlled = {
            self.ArticleType.CONSUMABLE,
            self.ArticleType.INPUT,
        }
        minimum_required = self.article_type in quantity_controlled or (
            self.article_type == self.ArticleType.SPARE_PART and self.is_critical
        )

        if minimum_required and self.minimum_stock is None:
            raise ValidationError(
                {"minimum_stock": "El stock minimo es obligatorio para este articulo."}
            )

        if self.article_type == self.ArticleType.TOOL and self.tracking_mode != self.TrackingMode.UNIT:
            raise ValidationError(
                {"tracking_mode": "Las herramientas deben controlarse por unidad."}
            )

        if self.loanable and self.tracking_mode != self.TrackingMode.UNIT:
            raise ValidationError(
                {"loanable": "Solo se pueden prestar articulos con tracking por unidad."}
            )

        if self.requires_expiry and not self.requires_lot:
            raise ValidationError(
                {"requires_expiry": "Para usar vencimiento, el articulo debe requerir lote."}
            )


class SafetyStockAlertRule(AuditedModel):
    class AlertStatus(models.TextChoices):
        MONITORING = "monitoring", "En monitoreo"
        TRIGGERED = "triggered", "Activada"

    article = models.OneToOneField(
        Article,
        on_delete=models.CASCADE,
        related_name="safety_alert_rule",
    )
    is_enabled = models.BooleanField(default=True)
    recipients = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="inventory_safety_alert_rules",
    )
    additional_emails = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=16,
        choices=AlertStatus.choices,
        default=AlertStatus.MONITORING,
    )
    last_stock_value = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )
    triggered_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    last_notified_at = models.DateTimeField(null=True, blank=True)
    last_email_error = models.TextField(blank=True)

    class Meta:
        ordering = ["article__name"]
        verbose_name = "Alarma por stock de seguridad"
        verbose_name_plural = "Alarmas por stock de seguridad"

    def __str__(self):
        return f"Alarma {self.article.internal_code}"


class MinimumStockDigestConfig(AuditedModel):
    class Frequency(models.TextChoices):
        DAILY = "daily", "Diario"
        WEEKLY = "weekly", "Semanal"

    class DeliveryStatus(models.TextChoices):
        NEVER = "never", "Sin ejecuciones"
        SUCCESS = "success", "Enviado"
        WARNING = "warning", "Con advertencias"
        ERROR = "error", "Error"
        SKIPPED = "skipped", "Sin envio"

    key = models.CharField(max_length=32, unique=True, default="default")
    is_enabled = models.BooleanField(default=True)
    frequency = models.CharField(
        max_length=16,
        choices=Frequency.choices,
        default=Frequency.DAILY,
    )
    run_at = models.TimeField(default=time(8, 0))
    run_weekday = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(6)],
    )
    recipients = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="inventory_minimum_stock_digest_configs",
    )
    additional_emails = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    last_notified_at = models.DateTimeField(null=True, blank=True)
    last_email_error = models.TextField(blank=True)
    last_summary_count = models.PositiveIntegerField(null=True, blank=True)
    last_period_key = models.CharField(max_length=64, blank=True)
    inflight_period_key = models.CharField(max_length=64, blank=True)
    inflight_started_at = models.DateTimeField(null=True, blank=True)
    last_delivery_status = models.CharField(
        max_length=16,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.NEVER,
    )
    last_recipient_warning = models.TextField(blank=True)
    force_send_next = models.BooleanField(
        default=False,
        help_text="Marca para forzar el envío en el próximo ciclo (se auto-resetea después)",
    )

    class Meta:
        ordering = ["key"]
        verbose_name = "Resumen periodico de stock minimo"
        verbose_name_plural = "Resumenes periodicos de stock minimo"

    def __str__(self):
        return "Resumen periodico de stock minimo"


class FullStockReportConfig(AuditedModel):
    class Frequency(models.TextChoices):
        DAILY = "daily", "Diario"
        WEEKLY = "weekly", "Semanal"

    class DeliveryStatus(models.TextChoices):
        NEVER = "never", "Sin ejecuciones"
        SUCCESS = "success", "Enviado"
        WARNING = "warning", "Con advertencias"
        ERROR = "error", "Error"
        SKIPPED = "skipped", "Sin envio"

    key = models.CharField(max_length=32, unique=True, default="default")
    is_enabled = models.BooleanField(default=True)
    frequency = models.CharField(
        max_length=16,
        choices=Frequency.choices,
        default=Frequency.DAILY,
    )
    run_at = models.TimeField(default=time(8, 0))
    run_weekday = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(6)],
    )
    recipients = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="inventory_full_stock_report_configs",
    )
    additional_emails = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    last_notified_at = models.DateTimeField(null=True, blank=True)
    last_email_error = models.TextField(blank=True)
    last_summary_count = models.PositiveIntegerField(null=True, blank=True)
    last_period_key = models.CharField(max_length=64, blank=True)
    inflight_period_key = models.CharField(max_length=64, blank=True)
    inflight_started_at = models.DateTimeField(null=True, blank=True)
    last_delivery_status = models.CharField(
        max_length=16,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.NEVER,
    )
    last_recipient_warning = models.TextField(blank=True)
    force_send_next = models.BooleanField(
        default=False,
        help_text="Marca para forzar el envío en el próximo ciclo (se auto-resetea después)",
    )

    class Meta:
        ordering = ["key"]
        verbose_name = "Reporte periodico de stock completo"
        verbose_name_plural = "Reportes periodicos de stock completo"

    def __str__(self):
        return "Reporte periodico de stock completo"


class InventoryAutomationTaskState(AuditedModel):
    class RuntimeState(models.TextChoices):
        IDLE = "idle", "Inactiva"
        RUNNING = "running", "En ejecucion"
        DISABLED = "disabled", "Deshabilitada"

    class LastRunStatus(models.TextChoices):
        NEVER = "never", "Sin ejecuciones"
        SUCCESS = "success", "Correcta"
        WARNING = "warning", "Con advertencias"
        ERROR = "error", "Error"
        SKIPPED = "skipped", "Sin trabajo"

    key = models.CharField(max_length=48, unique=True)
    runtime_state = models.CharField(
        max_length=16,
        choices=RuntimeState.choices,
        default=RuntimeState.IDLE,
    )
    owner_token = models.CharField(max_length=80, blank=True)
    owner_label = models.CharField(max_length=160, blank=True)
    lease_expires_at = models.DateTimeField(null=True, blank=True)
    heartbeat_at = models.DateTimeField(null=True, blank=True)
    last_started_at = models.DateTimeField(null=True, blank=True)
    last_finished_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_warning_at = models.DateTimeField(null=True, blank=True)
    last_error_at = models.DateTimeField(null=True, blank=True)
    last_run_status = models.CharField(
        max_length=16,
        choices=LastRunStatus.choices,
        default=LastRunStatus.NEVER,
    )
    last_error_message = models.TextField(blank=True)
    last_warning_message = models.TextField(blank=True)
    run_count = models.PositiveIntegerField(default=0)
    last_processed_count = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["key"]
        verbose_name = "Estado de automatizacion de inventario"
        verbose_name_plural = "Estados de automatizacion de inventario"

    def __str__(self):
        return self.key


class InventoryBatch(AuditedModel):
    class QualityStatus(models.TextChoices):
        PENDING = "pending", "Pendiente"
        APPROVED = "approved", "Aprobado"
        REJECTED = "rejected", "Rechazado"
        QUARANTINE = "quarantine", "Cuarentena"

    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,
        related_name="batches",
    )
    lot_code = models.CharField(max_length=80)
    expiry_date = models.DateField(null=True, blank=True)
    received_at = models.DateField(null=True, blank=True)
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="batches",
    )
    document_ref = models.CharField(max_length=120, blank=True)
    quality_status = models.CharField(
        max_length=24,
        choices=QualityStatus.choices,
        blank=True,
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["article__name", "lot_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["article", "lot_code"],
                name="unique_batch_per_article",
            )
        ]

    def __str__(self):
        return f"{self.article.internal_code} / {self.lot_code}"

    def clean(self):
        if not self.article.requires_lot:
            raise ValidationError({"article": "El articulo seleccionado no usa lotes."})
        if self.article.requires_expiry and not self.expiry_date:
            raise ValidationError(
                {"expiry_date": "La fecha de vencimiento es obligatoria para este lote."}
            )


class InventoryBalance(AuditedModel):
    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,
        related_name="balances",
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name="balances",
    )
    batch = models.ForeignKey(
        InventoryBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="balances",
    )
    on_hand = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    reserved = models.DecimalField(max_digits=12, decimal_places=3, default=0)

    class Meta:
        ordering = ["article__name", "location__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["article", "location", "batch"],
                name="unique_inventory_balance",
            ),
            models.UniqueConstraint(
                fields=["article", "location"],
                condition=Q(batch__isnull=True),
                name="unique_inventory_balance_without_batch",
            ),
        ]

    def __str__(self):
        return f"{self.article.internal_code} @ {self.location.code}"

    @property
    def available(self):
        return self.on_hand - self.reserved

    def clean(self):
        if self.article.tracking_mode != Article.TrackingMode.QUANTITY:
            raise ValidationError(
                {"article": "Solo los articulos por cantidad usan balances de inventario."}
            )
        if self.batch and self.batch.article_id != self.article_id:
            raise ValidationError({"batch": "El lote no pertenece al articulo indicado."})


class TrackedUnit(AuditedModel):
    class UnitStatus(models.TextChoices):
        AVAILABLE = "available", "Disponible"
        CHECKED_OUT = "checked_out", "Prestada"
        IN_USE = "in_use", "En uso"
        REPAIR = "repair", "En reparacion"
        OUT_OF_SERVICE = "out_of_service", "Fuera de servicio"
        LOST = "lost", "Perdida"
        RETIRED = "retired", "Dada de baja"

    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,
        related_name="tracked_units",
    )
    internal_tag = models.CharField(max_length=60, unique=True)
    status = models.CharField(
        max_length=24,
        choices=UnitStatus.choices,
        default=UnitStatus.AVAILABLE,
    )
    current_location = models.ForeignKey(
        Location,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tracked_units",
    )
    current_sector = models.ForeignKey(
        Sector,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tracked_units",
    )
    current_holder_person = models.ForeignKey(
        Person,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="held_units",
    )
    serial_number = models.CharField(max_length=120, blank=True)
    brand = models.CharField(max_length=120, blank=True)
    model = models.CharField(max_length=120, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    useful_life_days = models.PositiveIntegerField(null=True, blank=True)
    last_revision_at = models.DateField(null=True, blank=True)
    retired_at = models.DateField(null=True, blank=True)
    size = models.CharField(max_length=40, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["internal_tag"]

    def __str__(self):
        return self.internal_tag

    def clean(self):
        if self.article.tracking_mode != Article.TrackingMode.UNIT:
            raise ValidationError(
                {"article": "Solo los articulos por unidad pueden tener unidades trazadas."}
            )
        if not self.current_location and not self.current_sector and not self.current_holder_person:
            raise ValidationError(
                "La unidad debe tener al menos una ubicacion, sector o persona actual."
            )


class StockMovement(AuditedModel):
    class MovementType(models.TextChoices):
        PURCHASE_IN = "purchase_in", "Ingreso por compra"
        RETURN_IN = "return_in", "Ingreso por devolucion"
        ADJUSTMENT_IN = "adjustment_in", "Ingreso por ajuste"
        CONSUMPTION_OUT = "consumption_out", "Egreso por consumo"
        PRODUCTION_OUT = "production_out", "Egreso por produccion"
        LOAN_OUT = "loan_out", "Egreso por prestamo"
        DAMAGE_OUT = "damage_out", "Egreso por rotura"
        EXPIRED_OUT = "expired_out", "Egreso por vencimiento"
        TRANSFER = "transfer", "Transferencia"
        COUNT_ADJUST = "count_adjust", "Ajuste por inventario"
        DISPOSAL_OUT = "disposal_out", "Baja definitiva"

    timestamp = models.DateTimeField(default=timezone.now)
    movement_type = models.CharField(max_length=24, choices=MovementType.choices)
    article = models.ForeignKey(
        Article,
        on_delete=models.PROTECT,
        related_name="movements",
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="recorded_movements",
    )
    tracked_unit = models.ForeignKey(
        TrackedUnit,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movements",
    )
    batch = models.ForeignKey(
        InventoryBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movements",
    )
    source_location = models.ForeignKey(
        Location,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="outgoing_movements",
    )
    target_location = models.ForeignKey(
        Location,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incoming_movements",
    )
    person = models.ForeignKey(
        Person,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements",
    )
    sector = models.ForeignKey(
        Sector,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements",
    )
    reason_text = models.CharField(max_length=255, blank=True)
    document_ref = models.CharField(max_length=120, blank=True)
    authorized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="authorized_movements",
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-timestamp", "-id"]

    def __str__(self):
        return f"{self.get_movement_type_display()} - {self.article.internal_code}"

    def clean(self):
        sensitive_types = {
            self.MovementType.ADJUSTMENT_IN,
            self.MovementType.DAMAGE_OUT,
            self.MovementType.EXPIRED_OUT,
            self.MovementType.COUNT_ADJUST,
            self.MovementType.DISPOSAL_OUT,
        }

        if self.quantity <= 0:
            raise ValidationError({"quantity": "La cantidad debe ser mayor a cero."})
        if self.tracked_unit and self.tracked_unit.article_id != self.article_id:
            raise ValidationError({"tracked_unit": "La unidad no coincide con el articulo."})
        if self.tracked_unit and self.quantity != 1:
            raise ValidationError(
                {"quantity": "Los movimientos de unidades trazadas deben ser de 1 unidad."}
            )
        if self.batch and self.batch.article_id != self.article_id:
            raise ValidationError({"batch": "El lote no pertenece al articulo."})
        if self.movement_type in sensitive_types and not self.reason_text.strip():
            raise ValidationError(
                {"reason_text": "Este tipo de movimiento requiere motivo."}
            )
        if (
            self.movement_type == self.MovementType.TRANSFER
            and (not self.source_location or not self.target_location)
        ):
            raise ValidationError(
                {
                    "target_location": "Las transferencias requieren origen y destino.",
                }
            )
        if (
            self.movement_type == self.MovementType.TRANSFER
            and self.source_location_id == self.target_location_id
        ):
            raise ValidationError(
                {"target_location": "El origen y el destino no pueden ser iguales."}
            )


class AssetCheckout(AuditedModel):
    class CheckoutKind(models.TextChoices):
        LOAN = "loan", "Prestamo"
        ASSIGNMENT = "assignment", "Asignacion"

    class CheckoutStatus(models.TextChoices):
        OPEN = "open", "Abierto"
        RETURNED = "returned", "Devuelto"
        OVERDUE = "overdue", "Vencido"
        CANCELLED = "cancelled", "Cancelado"

    tracked_unit = models.ForeignKey(
        TrackedUnit,
        on_delete=models.PROTECT,
        related_name="checkouts",
    )
    receiver_person = models.ForeignKey(
        Person,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="received_checkouts",
    )
    receiver_sector = models.ForeignKey(
        Sector,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="received_checkouts",
    )
    checkout_kind = models.CharField(max_length=16, choices=CheckoutKind.choices)
    checked_out_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(
        max_length=16,
        choices=CheckoutStatus.choices,
        default=CheckoutStatus.OPEN,
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="recorded_checkouts",
    )
    expected_return_at = models.DateTimeField(null=True, blank=True)
    returned_at = models.DateTimeField(null=True, blank=True)
    condition_out = models.CharField(max_length=120, blank=True)
    condition_in = models.CharField(max_length=120, blank=True)
    authorized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="authorized_checkouts",
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-checked_out_at"]

    def __str__(self):
        return f"{self.tracked_unit.internal_tag} - {self.get_status_display()}"

    def clean(self):
        if not self.receiver_person and not self.receiver_sector:
            raise ValidationError(
                "El prestamo o asignacion debe tener al menos una persona o sector receptor."
            )


class PhysicalCountSession(AuditedModel):
    class CountType(models.TextChoices):
        GENERAL = "general", "General"
        PARTIAL = "partial", "Parcial"
        SECTOR = "sector", "Por sector"
        FAMILY = "family", "Por familia"
        CYCLIC = "cyclic", "Ciclico"

    class CountStatus(models.TextChoices):
        OPEN = "open", "Abierto"
        REVIEW = "review", "En revision"
        CLOSED = "closed", "Cerrado"

    count_type = models.CharField(max_length=16, choices=CountType.choices)
    scope = models.CharField(max_length=120)
    scheduled_for = models.DateTimeField(default=timezone.now)
    status = models.CharField(
        max_length=16,
        choices=CountStatus.choices,
        default=CountStatus.OPEN,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="count_sessions",
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-scheduled_for"]

    def __str__(self):
        return f"{self.get_count_type_display()} - {self.scope}"


class PhysicalCountLine(AuditedModel):
    class ReviewStatus(models.TextChoices):
        PENDING = "pending", "Pendiente"
        REVIEWED = "reviewed", "Revisado"
        APPROVED = "approved", "Aprobado"

    session = models.ForeignKey(
        PhysicalCountSession,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    article = models.ForeignKey(
        Article,
        on_delete=models.PROTECT,
        related_name="count_lines",
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.PROTECT,
        related_name="count_lines",
    )
    system_qty = models.DecimalField(max_digits=12, decimal_places=3)
    counted_qty = models.DecimalField(max_digits=12, decimal_places=3)
    counter_person = models.ForeignKey(
        Person,
        on_delete=models.PROTECT,
        related_name="count_lines",
    )
    notes = models.TextField(blank=True)
    possible_cause = models.CharField(max_length=255, blank=True)
    review_status = models.CharField(
        max_length=16,
        choices=ReviewStatus.choices,
        default=ReviewStatus.PENDING,
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_count_lines",
    )

    class Meta:
        ordering = ["session", "article__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["session", "article", "location"],
                name="unique_count_line",
            )
        ]

    def __str__(self):
        return f"{self.session_id} - {self.article.internal_code}"


class StockDiscrepancy(AuditedModel):
    class DifferenceType(models.TextChoices):
        POSITIVE = "positive", "Positiva"
        NEGATIVE = "negative", "Negativa"

    class DiscrepancyStatus(models.TextChoices):
        OPEN = "open", "Abierta"
        RESOLVED = "resolved", "Resuelta"
        IGNORED = "ignored", "Ignorada"

    article = models.ForeignKey(
        Article,
        on_delete=models.PROTECT,
        related_name="discrepancies",
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="discrepancies",
    )
    count_line = models.ForeignKey(
        PhysicalCountLine,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="discrepancies",
    )
    difference_qty = models.DecimalField(max_digits=12, decimal_places=3)
    difference_type = models.CharField(max_length=16, choices=DifferenceType.choices)
    detected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="detected_discrepancies",
    )
    detected_at = models.DateTimeField(default=timezone.now)
    possible_cause = models.CharField(max_length=255, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_discrepancies",
    )
    action_taken = models.CharField(max_length=255, blank=True)
    comment = models.TextField(blank=True)
    evidence = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=16,
        choices=DiscrepancyStatus.choices,
        default=DiscrepancyStatus.OPEN,
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    movement = models.ForeignKey(
        StockMovement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_discrepancies",
    )

    class Meta:
        ordering = ["-detected_at"]

    def __str__(self):
        return f"{self.article.internal_code} - {self.difference_qty}"

    def clean(self):
        if self.difference_qty == 0:
            raise ValidationError(
                {"difference_qty": "La diferencia debe ser distinta de cero."}
            )


class InternalRequest(AuditedModel):
    class RequestStatus(models.TextChoices):
        DRAFT = "draft", "Borrador"
        PENDING = "pending", "Pendiente"
        APPROVED = "approved", "Aprobada"
        PARTIAL = "partial", "Entrega parcial"
        CLOSED = "closed", "Cerrada"
        REJECTED = "rejected", "Rechazada"

    request_number = models.CharField(max_length=40, unique=True)
    requested_at = models.DateTimeField(default=timezone.now)
    requester = models.ForeignKey(
        Person,
        on_delete=models.PROTECT,
        related_name="internal_requests",
    )
    requesting_sector = models.ForeignKey(
        Sector,
        on_delete=models.PROTECT,
        related_name="internal_requests",
    )
    status = models.CharField(
        max_length=16,
        choices=RequestStatus.choices,
        default=RequestStatus.PENDING,
    )
    delivery_responsible = models.ForeignKey(
        Person,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="delivered_internal_requests",
    )
    notes = models.TextField(blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    reject_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-requested_at"]

    def __str__(self):
        return self.request_number


class InternalRequestLine(AuditedModel):
    request = models.ForeignKey(
        InternalRequest,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    article = models.ForeignKey(
        Article,
        on_delete=models.PROTECT,
        related_name="internal_request_lines",
    )
    quantity_requested = models.DecimalField(max_digits=12, decimal_places=3)
    quantity_delivered = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["request", "article__name"]

    def __str__(self):
        return f"{self.request.request_number} - {self.article.internal_code}"
