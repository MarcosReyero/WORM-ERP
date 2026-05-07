import json

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .services import (
    CommunicationsApiError,
    build_messages_overview,
    close_alarm,
    get_conversation_detail,
    list_conversations,
    mark_conversation_read,
    send_conversation_reply,
    start_direct_conversation,
)


def _unauthorized():
    """Maneja unauthorized."""
    return JsonResponse({"detail": "Authentication required"}, status=401)


def _parse_json(request):
    """Maneja parse json."""
    if not request.body:
        return {}

    try:
        return json.loads(request.body)
    except json.JSONDecodeError:
        raise CommunicationsApiError("Invalid JSON payload")


def _request_payload(request):
    """Maneja request payload."""
    content_type = request.headers.get("Content-Type", "")
    if "application/json" in content_type:
        return _parse_json(request)
    return request.POST


def _handle_call(callback):
    """Maneja handle call."""
    try:
        return callback()
    except CommunicationsApiError as exc:
        return JsonResponse({"detail": exc.detail}, status=exc.status)


@require_GET
def messages_overview(request):
    """Maneja messages overview."""
    if not request.user.is_authenticated:
        return _unauthorized()
    return _handle_call(lambda: JsonResponse(build_messages_overview(request.user)))


@require_http_methods(["GET", "POST"])
def conversations(request):
    """Maneja conversations."""
    if not request.user.is_authenticated:
        return _unauthorized()

    if request.method == "GET":
        filter_key = (request.GET.get("filter") or "inbox").strip().lower()
        return _handle_call(
            lambda: JsonResponse({"items": list_conversations(request.user, filter_key=filter_key)})
        )

    def handler():
        """Maneja handler."""
        item = start_direct_conversation(
            request.user,
            _request_payload(request),
            attachments=request.FILES.getlist("attachments"),
        )
        return JsonResponse({"detail": "Message sent", "item": item}, status=201)

    return _handle_call(handler)


@require_GET
def conversation_detail(request, conversation_id):
    """Maneja conversation detail."""
    if not request.user.is_authenticated:
        return _unauthorized()
    return _handle_call(
        lambda: JsonResponse({"item": get_conversation_detail(request.user, conversation_id)})
    )


@require_POST
def conversation_messages(request, conversation_id):
    """Maneja conversation messages."""
    if not request.user.is_authenticated:
        return _unauthorized()

    def handler():
        """Maneja handler."""
        item = send_conversation_reply(
            request.user,
            conversation_id,
            _request_payload(request),
            attachments=request.FILES.getlist("attachments"),
        )
        return JsonResponse({"detail": "Message sent", "item": item}, status=201)

    return _handle_call(handler)


@require_POST
def conversation_read(request, conversation_id):
    """Maneja conversation read."""
    if not request.user.is_authenticated:
        return _unauthorized()
    return _handle_call(
        lambda: JsonResponse(
            {
                "detail": "Conversation marked as read",
                "item": mark_conversation_read(request.user, conversation_id),
            }
        )
    )


@require_POST
def alarm_close(request, alarm_id):
    """Maneja alarm close."""
    if not request.user.is_authenticated:
        return _unauthorized()
    return _handle_call(
        lambda: JsonResponse(
            {"detail": "Alarm closed", "item": close_alarm(request.user, alarm_id)}
        )
    )
