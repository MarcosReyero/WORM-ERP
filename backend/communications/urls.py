from django.urls import path

from .views import (
    alarm_close,
    conversation_detail,
    conversation_messages,
    conversation_read,
    conversations,
    messages_overview,
)

urlpatterns = [
    path("overview/", messages_overview, name="messages-overview"),
    path("conversations/", conversations, name="messages-conversations"),
    path("conversations/<int:conversation_id>/", conversation_detail, name="messages-conversation-detail"),
    path(
        "conversations/<int:conversation_id>/messages/",
        conversation_messages,
        name="messages-conversation-messages",
    ),
    path(
        "conversations/<int:conversation_id>/read/",
        conversation_read,
        name="messages-conversation-read",
    ),
    path("alarms/<int:alarm_id>/close/", alarm_close, name="messages-alarm-close"),
]
