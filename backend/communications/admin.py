from django.contrib import admin

from .models import Conversation, ConversationParticipant, InventoryAlarm, Message, MessageAttachment


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "kind", "subject", "is_closed", "created_by", "last_message_at")
    list_filter = ("kind", "is_closed")
    search_fields = ("subject", "created_by__username")


@admin.register(ConversationParticipant)
class ConversationParticipantAdmin(admin.ModelAdmin):
    list_display = ("conversation", "user", "last_read_at", "archived_at")
    list_filter = ("archived_at",)
    search_fields = ("conversation__subject", "user__username")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender", "message_kind", "priority", "created_at")
    list_filter = ("message_kind", "priority")
    search_fields = ("conversation__subject", "sender__username", "body")


@admin.register(MessageAttachment)
class MessageAttachmentAdmin(admin.ModelAdmin):
    list_display = ("id", "message", "original_name", "content_type", "size_bytes")
    search_fields = ("original_name", "message__conversation__subject")


@admin.register(InventoryAlarm)
class InventoryAlarmAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "target_user", "priority", "status", "created_at", "closed_at")
    list_filter = ("priority", "status")
    search_fields = ("title", "target_user__username", "body")
