from django.conf import settings
from django.db import models

from inventory.models import Article, AuditedModel


class Conversation(AuditedModel):
    class ConversationKind(models.TextChoices):
        DIRECT = "direct", "Directa"
        ALARM = "alarm", "Alarma"

    kind = models.CharField(max_length=16, choices=ConversationKind.choices)
    subject = models.CharField(max_length=160, blank=True)
    is_closed = models.BooleanField(default=False)
    last_message_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_message_at", "-created_at"]

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        return self.subject or f"{self.get_kind_display()} #{self.pk}"


class ConversationParticipant(models.Model):
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="participants",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="message_participations",
    )
    last_read_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["conversation_id", "user__username"]
        constraints = [
            models.UniqueConstraint(
                fields=["conversation", "user"],
                name="unique_conversation_participant",
            )
        ]

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        return f"{self.user.username} @ {self.conversation_id}"


class Message(AuditedModel):
    class MessageKind(models.TextChoices):
        MANUAL = "manual", "Manual"
        INVENTORY_ALARM = "inventory_alarm", "Alarma de inventario"

    class Priority(models.TextChoices):
        LOW = "low", "Baja"
        NORMAL = "normal", "Normal"
        HIGH = "high", "Alta"
        CRITICAL = "critical", "Critica"

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sent_messages",
    )
    body = models.TextField()
    message_kind = models.CharField(
        max_length=24,
        choices=MessageKind.choices,
        default=MessageKind.MANUAL,
    )
    priority = models.CharField(
        max_length=16,
        choices=Priority.choices,
        default=Priority.NORMAL,
    )

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        return f"{self.conversation_id} - {self.get_message_kind_display()}"


class MessageAttachment(models.Model):
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to="message-attachments/%Y/%m/")
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        return self.original_name


class InventoryAlarm(AuditedModel):
    class AlarmStatus(models.TextChoices):
        OPEN = "open", "Abierta"
        READ = "read", "Leida"
        CLOSED = "closed", "Cerrada"

    conversation = models.OneToOneField(
        Conversation,
        on_delete=models.CASCADE,
        related_name="inventory_alarm",
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="received_inventory_alarms",
    )
    title = models.CharField(max_length=160)
    body = models.TextField()
    priority = models.CharField(
        max_length=16,
        choices=Message.Priority.choices,
        default=Message.Priority.NORMAL,
    )
    status = models.CharField(
        max_length=16,
        choices=AlarmStatus.choices,
        default=AlarmStatus.OPEN,
    )
    article = models.ForeignKey(
        Article,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="alarms",
    )
    read_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        """Devuelve una representaci?n legible del objeto."""
        return self.title
