from django.contrib.auth import get_user_model
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from accounts.models import UserProfile
from inventory.models import Article
from .models import Conversation, ConversationParticipant, InventoryAlarm, Message, MessageAttachment


class CommunicationsApiError(Exception):
    def __init__(self, detail, status=400):
        """Inicializa la instancia."""
        super().__init__(detail)
        self.detail = detail
        self.status = status


ALARM_ROLES = {
    UserProfile.Role.ADMINISTRATOR,
    UserProfile.Role.STOREKEEPER,
    UserProfile.Role.SUPERVISOR,
    UserProfile.Role.MAINTENANCE,
}


def get_profile(user):
    """Devuelve profile."""
    defaults = {
        "role": UserProfile.Role.ADMINISTRATOR if user.is_superuser else UserProfile.Role.OPERATOR,
    }
    return UserProfile.objects.get_or_create(user=user, defaults=defaults)[0]


def require_active_user(user):
    """Maneja require active user."""
    if not user or not user.is_authenticated:
        raise CommunicationsApiError("Authentication required", status=401)
    profile = get_profile(user)
    if profile.status != UserProfile.Status.ACTIVE:
        raise CommunicationsApiError("User profile is inactive", status=403)
    return profile


def require_alarm_role(user):
    """Maneja require alarm role."""
    profile = require_active_user(user)
    if user.is_superuser or profile.role in ALARM_ROLES:
        return profile
    raise CommunicationsApiError("You do not have permission for this action", status=403)


def clean_string(value):
    """Maneja clean string."""
    return str(value or "").strip()


def contact_full_name(user):
    """Maneja contact full name."""
    return user.get_full_name() or user.username


def serialize_contact(user):
    """Maneja serialize contact."""
    profile = get_profile(user)
    return {
        "id": user.id,
        "username": user.username,
        "full_name": contact_full_name(user),
        "email": user.email,
        "avatar_url": profile.avatar.url if profile.avatar else None,
        "telegram_chat_id": profile.telegram_chat_id,
        "role": profile.role,
        "role_label": profile.get_role_display(),
        "status": profile.status,
        "sector_default": profile.sector_default.name if profile.sector_default else None,
    }


def active_message_contacts(current_user, include_current=False):
    """Maneja active message contacts."""
    require_active_user(current_user)
    user_model = get_user_model()
    queryset = user_model.objects.select_related("profile__sector_default").filter(
        profile__status=UserProfile.Status.ACTIVE
    )
    if not include_current:
        queryset = queryset.exclude(pk=current_user.pk)
    return [
        serialize_contact(user)
        for user in queryset.order_by("first_name", "last_name", "username")
    ]


def conversation_queryset_for(user):
    """Maneja conversation queryset for."""
    require_active_user(user)
    attachment_prefetch = Prefetch(
        "attachments",
        queryset=MessageAttachment.objects.order_by("id"),
        to_attr="prefetched_attachments",
    )
    message_prefetch = Prefetch(
        "messages",
        queryset=Message.objects.select_related("sender__profile").prefetch_related(attachment_prefetch).order_by("-created_at"),
        to_attr="prefetched_messages",
    )
    participant_prefetch = Prefetch(
        "participants",
        queryset=ConversationParticipant.objects.select_related("user__profile__sector_default").order_by("user__username"),
        to_attr="prefetched_participants",
    )
    return (
        Conversation.objects.filter(participants__user=user)
        .distinct()
        .select_related("inventory_alarm__article", "created_by__profile")
        .prefetch_related(message_prefetch, participant_prefetch)
        .order_by("-last_message_at", "-created_at")
    )


def participant_for_user(conversation, user):
    """Maneja participant for user."""
    participants = getattr(conversation, "prefetched_participants", None)
    if participants is None:
        participants = list(
            conversation.participants.select_related("user__profile__sector_default").order_by("user__username")
        )
    for participant in participants:
        if participant.user_id == user.id:
            return participant
    return None


def latest_message(conversation):
    """Maneja latest message."""
    prefetched = getattr(conversation, "prefetched_messages", None)
    if prefetched is not None:
        return prefetched[0] if prefetched else None
    return (
        conversation.messages.select_related("sender__profile")
        .prefetch_related("attachments")
        .order_by("-created_at")
        .first()
    )


def is_conversation_unread(conversation, user):
    """Verifica si conversation unread."""
    participant = participant_for_user(conversation, user)
    if not participant or not conversation.last_message_at:
        return False
    if participant.last_read_at is None:
        return True
    return participant.last_read_at < conversation.last_message_at


def serialize_alarm(alarm):
    """Maneja serialize alarm."""
    return {
        "id": alarm.id,
        "title": alarm.title,
        "body": alarm.body,
        "priority": alarm.priority,
        "priority_label": alarm.get_priority_display(),
        "status": alarm.status,
        "status_label": alarm.get_status_display(),
        "article_id": alarm.article_id,
        "article_name": alarm.article.name if alarm.article else None,
        "target_user_id": alarm.target_user_id,
        "target_user_name": contact_full_name(alarm.target_user),
        "created_by_id": alarm.created_by_id,
        "created_by_name": contact_full_name(alarm.created_by) if alarm.created_by else None,
        "created_at": alarm.created_at.isoformat(),
        "read_at": alarm.read_at.isoformat() if alarm.read_at else None,
        "closed_at": alarm.closed_at.isoformat() if alarm.closed_at else None,
    }


def serialize_message_attachment(attachment):
    """Maneja serialize message attachment."""
    return {
        "id": attachment.id,
        "name": attachment.original_name,
        "url": attachment.file.url,
        "content_type": attachment.content_type,
        "size_bytes": attachment.size_bytes,
    }


def serialize_message(message, current_user=None):
    """Maneja serialize message."""
    attachments = getattr(message, "prefetched_attachments", None)
    if attachments is None:
        attachments = list(message.attachments.all())
    return {
        "id": message.id,
        "body": message.body,
        "sender_id": message.sender_id,
        "sender_name": contact_full_name(message.sender) if message.sender else "Sistema",
        "sender_avatar_url": message.sender.profile.avatar.url if message.sender and message.sender.profile.avatar else None,
        "message_kind": message.message_kind,
        "message_kind_label": message.get_message_kind_display(),
        "priority": message.priority,
        "priority_label": message.get_priority_display(),
        "created_at": message.created_at.isoformat(),
        "is_mine": current_user.id == message.sender_id if current_user and message.sender_id else False,
        "attachments": [serialize_message_attachment(attachment) for attachment in attachments],
    }


def conversation_title_for_user(conversation, user):
    """Maneja conversation title for user."""
    if conversation.kind == Conversation.ConversationKind.ALARM and hasattr(conversation, "inventory_alarm"):
        return conversation.inventory_alarm.title

    if conversation.kind == Conversation.ConversationKind.DIRECT:
        participants = getattr(conversation, "prefetched_participants", None)
        if participants is None:
            participants = list(conversation.participants.select_related("user__profile"))
        others = [participant.user for participant in participants if participant.user_id != user.id]
        if others:
            return contact_full_name(others[0])

    return conversation.subject or "Conversacion"


def serialize_conversation_summary(conversation, user):
    """Maneja serialize conversation summary."""
    last_message = latest_message(conversation)
    alarm = getattr(conversation, "inventory_alarm", None)
    participants = getattr(conversation, "prefetched_participants", None)
    if participants is None:
        participants = list(
            conversation.participants.select_related("user__profile__sector_default").order_by("user__username")
        )
    preview_text = ""
    if last_message:
        preview_text = clean_string(last_message.body)[:120]
        if not preview_text:
            attachment_count = len(getattr(last_message, "prefetched_attachments", list(last_message.attachments.all())))
            if attachment_count == 1:
                preview_text = "Archivo adjunto"
            elif attachment_count > 1:
                preview_text = f"{attachment_count} archivos adjuntos"
    return {
        "id": conversation.id,
        "kind": conversation.kind,
        "kind_label": conversation.get_kind_display(),
        "subject": conversation.subject,
        "title": conversation_title_for_user(conversation, user),
        "last_message_at": conversation.last_message_at.isoformat() if conversation.last_message_at else None,
        "last_message_preview": preview_text,
        "last_sender_name": contact_full_name(last_message.sender) if last_message and last_message.sender else "Sistema" if last_message else "",
        "is_closed": conversation.is_closed,
        "is_unread": is_conversation_unread(conversation, user),
        "participants": [serialize_contact(participant.user) for participant in participants],
        "alarm": serialize_alarm(alarm) if alarm else None,
    }


def user_unread_message_count(user):
    """Maneja user unread message count."""
    if not user or not user.is_authenticated:
        return 0
    if get_profile(user).status != UserProfile.Status.ACTIVE:
        return 0
    queryset = conversation_queryset_for(user)
    return sum(1 for conversation in queryset if is_conversation_unread(conversation, user))


def user_open_alarm_count(user):
    """Maneja user open alarm count."""
    if not user or not user.is_authenticated:
        return 0
    if get_profile(user).status != UserProfile.Status.ACTIVE:
        return 0
    return InventoryAlarm.objects.filter(target_user=user, status=InventoryAlarm.AlarmStatus.OPEN).count()


def build_messages_overview(user):
    """Construye messages overview."""
    require_active_user(user)
    conversations = conversation_queryset_for(user)[:12]
    return {
        "counters": {
            "unread_messages": user_unread_message_count(user),
            "open_alarms": user_open_alarm_count(user),
            "total_conversations": conversation_queryset_for(user).count(),
        },
        "contacts": active_message_contacts(user),
        "recent_conversations": [serialize_conversation_summary(conversation, user) for conversation in conversations],
    }


def list_conversations(user, filter_key="inbox"):
    """Lista conversations."""
    require_active_user(user)
    conversations = list(conversation_queryset_for(user))
    if filter_key == "unread":
        conversations = [conversation for conversation in conversations if is_conversation_unread(conversation, user)]
    elif filter_key == "alarms":
        conversations = [conversation for conversation in conversations if conversation.kind == Conversation.ConversationKind.ALARM]
    return [serialize_conversation_summary(conversation, user) for conversation in conversations]


def get_conversation_detail(user, conversation_id):
    """Devuelve conversation detail."""
    require_active_user(user)
    conversation = get_object_or_404(conversation_queryset_for(user), pk=conversation_id)
    messages = [
        serialize_message(message, current_user=user)
        for message in conversation.messages.select_related("sender__profile")
        .prefetch_related("attachments")
        .order_by("created_at", "id")
    ]
    return {
        "conversation": serialize_conversation_summary(conversation, user),
        "messages": messages,
    }


def ensure_active_target(target_user):
    """Maneja ensure active target."""
    if not target_user:
        raise CommunicationsApiError("target_user is required")
    target_profile = get_profile(target_user)
    if target_profile.status != UserProfile.Status.ACTIVE:
        raise CommunicationsApiError("The selected user is inactive")
    return target_profile


def ensure_direct_conversation(sender, recipient, subject=""):
    """Maneja ensure direct conversation."""
    conversation = (
        Conversation.objects.filter(kind=Conversation.ConversationKind.DIRECT, participants__user=sender)
        .filter(participants__user=recipient)
        .distinct()
        .first()
    )
    if conversation:
        return conversation

    conversation = Conversation.objects.create(
        kind=Conversation.ConversationKind.DIRECT,
        subject=clean_string(subject),
        created_by=sender,
        updated_by=sender,
    )
    ConversationParticipant.objects.bulk_create(
        [
            ConversationParticipant(conversation=conversation, user=sender, last_read_at=timezone.now()),
            ConversationParticipant(conversation=conversation, user=recipient),
        ]
    )
    return conversation


def append_message(
    conversation,
    sender,
    body,
    message_kind=Message.MessageKind.MANUAL,
    priority=Message.Priority.NORMAL,
    attachments=None,
):
    """Maneja append message."""
    cleaned_body = clean_string(body)
    attachments = attachments or []
    if not cleaned_body and not attachments:
        raise CommunicationsApiError("message body or attachments are required")

    message = Message.objects.create(
        conversation=conversation,
        sender=sender,
        body=cleaned_body,
        message_kind=message_kind,
        priority=priority,
        created_by=sender,
        updated_by=sender,
    )
    attachment_records = []
    for upload in attachments:
        attachment_records.append(
            MessageAttachment(
                message=message,
                file=upload,
                original_name=upload.name,
                content_type=getattr(upload, "content_type", "") or "",
                size_bytes=getattr(upload, "size", 0) or 0,
            )
        )
    if attachment_records:
        MessageAttachment.objects.bulk_create(attachment_records)
    conversation.last_message_at = message.created_at
    conversation.updated_by = sender
    conversation.save(update_fields=["last_message_at", "updated_at", "updated_by"])
    ConversationParticipant.objects.filter(conversation=conversation, user=sender).update(
        last_read_at=message.created_at
    )
    return message


def start_direct_conversation(user, payload, attachments=None):
    """Maneja start direct conversation."""
    require_active_user(user)
    recipient_id = payload.get("recipient_user_id")
    if not recipient_id:
        raise CommunicationsApiError("recipient_user_id is required")
    recipient = get_object_or_404(get_user_model(), pk=recipient_id)
    if recipient.pk == user.pk:
        raise CommunicationsApiError("You cannot send a message to yourself")
    ensure_active_target(recipient)

    conversation = ensure_direct_conversation(
        user,
        recipient,
        subject=payload.get("subject") or "",
    )
    append_message(
        conversation,
        user,
        payload.get("body"),
        message_kind=Message.MessageKind.MANUAL,
        priority=payload.get("priority") or Message.Priority.NORMAL,
        attachments=attachments,
    )
    return get_conversation_detail(user, conversation.id)


def send_conversation_reply(user, conversation_id, payload, attachments=None):
    """Env?a conversation reply."""
    require_active_user(user)
    conversation = get_object_or_404(conversation_queryset_for(user), pk=conversation_id)
    append_message(
        conversation,
        user,
        payload.get("body"),
        message_kind=Message.MessageKind.MANUAL,
        priority=payload.get("priority") or Message.Priority.NORMAL,
        attachments=attachments,
    )
    return get_conversation_detail(user, conversation.id)


def mark_conversation_read(user, conversation_id):
    """Maneja mark conversation read."""
    require_active_user(user)
    conversation = get_object_or_404(conversation_queryset_for(user), pk=conversation_id)
    timestamp = conversation.last_message_at or timezone.now()
    ConversationParticipant.objects.filter(conversation=conversation, user=user).update(last_read_at=timestamp)

    alarm = getattr(conversation, "inventory_alarm", None)
    if alarm and alarm.target_user_id == user.id and alarm.status == InventoryAlarm.AlarmStatus.OPEN:
        alarm.status = InventoryAlarm.AlarmStatus.READ
        alarm.read_at = timezone.now()
        alarm.updated_by = user
        alarm.save(update_fields=["status", "read_at", "updated_at", "updated_by"])

    return serialize_conversation_summary(get_object_or_404(conversation_queryset_for(user), pk=conversation_id), user)


def close_alarm(user, alarm_id):
    """Maneja close alarm."""
    profile = require_active_user(user)
    alarm = get_object_or_404(
        InventoryAlarm.objects.select_related("conversation", "target_user", "created_by", "article"),
        pk=alarm_id,
    )
    if not (
        user.is_superuser
        or profile.role == UserProfile.Role.ADMINISTRATOR
        or alarm.target_user_id == user.id
        or alarm.created_by_id == user.id
    ):
        raise CommunicationsApiError("You do not have permission for this action", status=403)

    alarm.status = InventoryAlarm.AlarmStatus.CLOSED
    alarm.closed_at = timezone.now()
    alarm.updated_by = user
    alarm.save(update_fields=["status", "closed_at", "updated_at", "updated_by"])
    alarm.conversation.is_closed = True
    alarm.conversation.updated_by = user
    alarm.conversation.save(update_fields=["is_closed", "updated_at", "updated_by"])
    return serialize_alarm(alarm)


def serialize_inventory_alarm_list_item(alarm):
    """Maneja serialize inventory alarm list item."""
    return {
        **serialize_alarm(alarm),
        "conversation_id": alarm.conversation_id,
    }


def list_inventory_alarms(user):
    """Lista inventory alarms."""
    profile = require_active_user(user)
    queryset = InventoryAlarm.objects.select_related(
        "conversation",
        "target_user__profile",
        "created_by__profile",
        "article",
    ).order_by("-created_at")

    if not (user.is_superuser or profile.role in ALARM_ROLES):
        queryset = queryset.filter(Q(target_user=user) | Q(created_by=user))

    return [serialize_inventory_alarm_list_item(alarm) for alarm in queryset[:50]]


def create_inventory_alarm(user, payload):
    """Crea inventory alarm."""
    require_alarm_role(user)
    target_user_id = payload.get("target_user_id")
    title = clean_string(payload.get("title"))
    body = clean_string(payload.get("body"))
    priority = payload.get("priority") or Message.Priority.HIGH
    if not target_user_id or not title or not body:
        raise CommunicationsApiError("target_user_id, title and body are required")

    target_user = get_object_or_404(get_user_model(), pk=target_user_id)
    ensure_active_target(target_user)
    article = None
    article_id = payload.get("article_id")
    if article_id not in (None, "", []):
        article = get_object_or_404(Article, pk=article_id)

    conversation = Conversation.objects.create(
        kind=Conversation.ConversationKind.ALARM,
        subject=title,
        created_by=user,
        updated_by=user,
    )
    ConversationParticipant.objects.bulk_create(
        [
            ConversationParticipant(conversation=conversation, user=user, last_read_at=timezone.now()),
            ConversationParticipant(conversation=conversation, user=target_user),
        ]
    )
    alarm = InventoryAlarm.objects.create(
        conversation=conversation,
        target_user=target_user,
        title=title,
        body=body,
        priority=priority,
        article=article,
        created_by=user,
        updated_by=user,
    )
    append_message(
        conversation,
        user,
        body,
        message_kind=Message.MessageKind.INVENTORY_ALARM,
        priority=priority,
    )
    return serialize_inventory_alarm_list_item(alarm)
