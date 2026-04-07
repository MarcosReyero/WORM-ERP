import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase

from accounts.models import UserProfile
from inventory.models import Article, Sector, UnitOfMeasure

from .models import Conversation, InventoryAlarm, Message, MessageAttachment


class CommunicationsApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.sender = user_model.objects.create_user(
            username="sender",
            password="StrongPass123",
            first_name="Ana",
            last_name="Sender",
        )
        self.recipient = user_model.objects.create_user(
            username="recipient",
            password="StrongPass123",
            first_name="Beto",
            last_name="Receiver",
        )
        self.sender.profile.role = UserProfile.Role.STOREKEEPER
        self.sender.profile.save(update_fields=["role"])

        self.sector, _ = Sector.objects.get_or_create(
            code="DEP",
            defaults={"name": "Deposito"},
        )
        self.unit, _ = UnitOfMeasure.objects.get_or_create(
            code="UN",
            defaults={"name": "Unidad"},
        )
        self.article, _ = Article.objects.get_or_create(
            internal_code="CON-0001",
            defaults={
                "name": "Guantes de prueba",
                "article_type": Article.ArticleType.CONSUMABLE,
                "unit_of_measure": self.unit,
                "sector_responsible": self.sector,
                "tracking_mode": Article.TrackingMode.QUANTITY,
                "minimum_stock": Decimal("1"),
            },
        )

    def test_direct_messages_reuse_same_conversation(self):
        client = Client()
        client.force_login(self.sender)

        payload = {
            "recipient_user_id": self.recipient.id,
            "body": "Primera prueba",
        }
        first_response = client.post(
            "/api/messages/conversations/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        second_response = client.post(
            "/api/messages/conversations/",
            data=json.dumps({**payload, "body": "Segunda prueba"}),
            content_type="application/json",
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 201)
        self.assertEqual(Conversation.objects.count(), 1)
        self.assertEqual(Message.objects.count(), 2)
        self.assertEqual(
            first_response.json()["item"]["conversation"]["id"],
            second_response.json()["item"]["conversation"]["id"],
        )

    def test_inventory_alarm_flows_through_messages(self):
        sender_client = Client()
        sender_client.force_login(self.sender)

        create_response = sender_client.post(
            "/api/inventory/alarms/",
            data=json.dumps(
                {
                    "target_user_id": self.recipient.id,
                    "title": "Revisar stock critico",
                    "body": "Confirmar nivel de guantes en deposito.",
                    "priority": "high",
                    "article_id": self.article.id,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(create_response.status_code, 201)
        alarm_id = create_response.json()["item"]["id"]
        conversation_id = create_response.json()["item"]["conversation_id"]
        alarm = InventoryAlarm.objects.get(pk=alarm_id)
        self.assertEqual(alarm.status, InventoryAlarm.AlarmStatus.OPEN)

        recipient_client = Client()
        recipient_client.force_login(self.recipient)

        read_response = recipient_client.post(
            f"/api/messages/conversations/{conversation_id}/read/"
        )
        self.assertEqual(read_response.status_code, 200)
        alarm.refresh_from_db()
        self.assertEqual(alarm.status, InventoryAlarm.AlarmStatus.READ)

        close_response = recipient_client.post(f"/api/messages/alarms/{alarm_id}/close/")
        self.assertEqual(close_response.status_code, 200)
        alarm.refresh_from_db()
        self.assertEqual(alarm.status, InventoryAlarm.AlarmStatus.CLOSED)

    def test_reply_accepts_attachments_without_text(self):
        client = Client()
        client.force_login(self.sender)

        create_response = client.post(
            "/api/messages/conversations/",
            data=json.dumps(
                {
                    "recipient_user_id": self.recipient.id,
                    "body": "Inicio",
                }
            ),
            content_type="application/json",
        )
        conversation_id = create_response.json()["item"]["conversation"]["id"]

        attachment = SimpleUploadedFile(
            "nota.txt",
            b"archivo interno",
            content_type="text/plain",
        )
        reply_response = client.post(
            f"/api/messages/conversations/{conversation_id}/messages/",
            data={"body": "", "attachments": attachment},
        )

        self.assertEqual(reply_response.status_code, 201)
        self.assertEqual(MessageAttachment.objects.count(), 1)
        reply_message = Message.objects.order_by("-id").first()
        self.assertEqual(reply_message.attachments.first().original_name, "nota.txt")
