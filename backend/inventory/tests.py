import json
from decimal import Decimal
from io import BytesIO
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from openpyxl.styles import Font, PatternFill
from openpyxl import Workbook

from accounts.models import UserProfile
from inventory.models import (
    Article,
    AssetCheckout,
    InventoryBalance,
    Location,
    Person,
    SafetyStockAlertRule,
    Sector,
    StockDiscrepancy,
    TrackedUnit,
    UnitOfMeasure,
)


class InventoryApiTests(TestCase):
    def build_excel_upload(self, workbook, name="articulos.xlsx"):
        buffer = BytesIO()
        workbook.save(buffer)
        buffer.seek(0)
        return SimpleUploadedFile(
            name,
            buffer.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    def setUp(self):
        self.media_dir = TemporaryDirectory()
        self.override_media = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.override_media.enable()

        user_model = get_user_model()
        self.storekeeper = user_model.objects.create_user(
            username="storekeeper",
            password="StrongPass123",
            email="storekeeper@inventary.local",
        )
        self.storekeeper.profile.role = UserProfile.Role.STOREKEEPER
        self.storekeeper.profile.save(update_fields=["role"])

        self.supervisor = user_model.objects.create_user(
            username="supervisor",
            password="StrongPass123",
            email="supervisor@inventary.local",
        )
        self.supervisor.profile.role = UserProfile.Role.SUPERVISOR
        self.supervisor.profile.save(update_fields=["role"])

        self.location = Location.objects.get(code="DEP-PRINCIPAL")
        self.person = Person.objects.first()

    def tearDown(self):
        self.override_media.disable()
        self.media_dir.cleanup()
        super().tearDown()

    def test_inventory_endpoint_requires_authentication(self):
        response = self.client.get("/api/inventory/overview/")
        self.assertEqual(response.status_code, 401)

    def test_inventory_overview_returns_new_workspace_shape(self):
        self.client.force_login(self.storekeeper)

        response = self.client.get("/api/inventory/overview/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("articles", payload)
        self.assertIn("catalogs", payload)
        self.assertGreaterEqual(len(payload["articles"]), 1)

    def test_consumable_article_requires_minimum_stock(self):
        self.client.force_login(self.storekeeper)
        unit = UnitOfMeasure.objects.get(code="UN")
        sector = Sector.objects.get(code="DEP")

        response = self.client.post(
            "/api/articles/",
            data=json.dumps(
                {
                    "internal_code": "TEST-001",
                    "name": "Articulo sin minimo",
                    "article_type": "consumable",
                    "unit_of_measure_id": unit.id,
                    "sector_responsible_id": sector.id,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_article_code_is_auto_generated_when_missing(self):
        self.client.force_login(self.storekeeper)
        unit = UnitOfMeasure.objects.get(code="UN")
        sector = Sector.objects.get(code="DEP")

        response = self.client.post(
            "/api/articles/",
            data=json.dumps(
                {
                    "name": "Guante nitrilo importado",
                    "article_type": "consumable",
                    "unit_of_measure_id": unit.id,
                    "sector_responsible_id": sector.id,
                    "minimum_stock": "10",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()["item"]
        self.assertTrue(payload["internal_code"].startswith("CON-"))
        self.assertTrue(
            Article.objects.filter(
                internal_code=payload["internal_code"],
                name="Guante nitrilo importado",
            ).exists()
        )

    def test_article_detail_can_update_fields_and_image(self):
        self.client.force_login(self.storekeeper)
        article = Article.objects.filter(tracking_mode=Article.TrackingMode.QUANTITY).first()
        upload = SimpleUploadedFile(
            "producto.png",
            b"fake-image-content",
            content_type="image/png",
        )

        response = self.client.post(
            f"/api/articles/{article.id}/",
            data={
                "name": "Articulo con ficha",
                "description": "Descripcion actualizada",
                "image": upload,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["item"]["article"]
        self.assertEqual(payload["name"], "Articulo con ficha")
        self.assertEqual(payload["description"], "Descripcion actualizada")
        self.assertIsNotNone(payload["image_url"])

        clear_response = self.client.post(
            f"/api/articles/{article.id}/",
            data={"clear_image": "true"},
        )
        self.assertEqual(clear_response.status_code, 200)
        self.assertIsNone(clear_response.json()["item"]["article"]["image_url"])

    def test_excel_import_requires_preview_then_confirm(self):
        self.client.force_login(self.storekeeper)

        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["nombre", "tipo", "unidad", "sector", "stock minimo", "stock inicial"])
        sheet.append(["Lubricante cadena", "consumible", "UN", "DEP", 5, 12])

        response = self.client.post(
            "/api/articles/import-excel/",
            data={
                "mode": "preview",
                "file": self.build_excel_upload(workbook),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["item"]
        self.assertEqual(payload["mode"], "preview")
        self.assertEqual(payload["ready_count"], 1)
        self.assertEqual(payload["error_count"], 0)
        self.assertFalse(Article.objects.filter(name="Lubricante cadena").exists())

        confirm_response = self.client.post(
            "/api/articles/import-excel/",
            data={
                "mode": "confirm",
                "file": self.build_excel_upload(workbook),
            },
        )

        self.assertEqual(confirm_response.status_code, 201)
        payload = confirm_response.json()["item"]
        self.assertEqual(payload["mode"], "confirm")
        self.assertEqual(payload["created_count"], 1)
        self.assertTrue(Article.objects.filter(name="Lubricante cadena").exists())

    def test_excel_import_accepts_simple_inventory_list(self):
        self.client.force_login(self.storekeeper)

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Inventario pañol"
        sheet["A1"] = "nombre"
        sheet["A2"] = "Elementos de proteccion personal"
        sheet["A2"].font = Font(bold=True)
        sheet["A2"].fill = PatternFill(fill_type="solid")
        sheet["A3"] = "Guantes moteados"
        sheet["A4"] = "Cofias"
        sheet["A5"] = "Insumos mantenimiento"
        sheet["A5"].font = Font(bold=True)
        sheet["A5"].fill = PatternFill(fill_type="solid")
        sheet["A6"] = "Rodamiento 6206"

        preview_response = self.client.post(
            "/api/articles/import-excel/",
            data={
                "mode": "preview",
                "file": self.build_excel_upload(workbook, name="panol.xlsx"),
            },
        )

        self.assertEqual(preview_response.status_code, 200)
        preview_payload = preview_response.json()["item"]
        self.assertEqual(preview_payload["ready_count"], 3)
        self.assertEqual(preview_payload["error_count"], 0)
        self.assertEqual(preview_payload["sheet_summaries"][0]["mode"], "simple_list")

        confirm_response = self.client.post(
            "/api/articles/import-excel/",
            data={
                "mode": "confirm",
                "file": self.build_excel_upload(workbook, name="panol.xlsx"),
            },
        )

        self.assertEqual(confirm_response.status_code, 201)
        self.assertTrue(Article.objects.filter(name="Guantes moteados").exists())
        self.assertTrue(Article.objects.filter(name="Cofias").exists())
        self.assertTrue(Article.objects.filter(name="Rodamiento 6206").exists())
        self.assertEqual(
            Article.objects.get(name="Guantes moteados").article_type,
            Article.ArticleType.PPE,
        )
        self.assertEqual(
            Article.objects.get(name="Rodamiento 6206").article_type,
            Article.ArticleType.SPARE_PART,
        )

    def test_quantity_movement_updates_balance(self):
        self.client.force_login(self.storekeeper)
        article = Article.objects.filter(tracking_mode=Article.TrackingMode.QUANTITY).first()
        balance = InventoryBalance.objects.filter(article=article, location=self.location).first()
        previous_stock = balance.on_hand

        response = self.client.post(
            "/api/movements/",
            data=json.dumps(
                {
                    "article_id": article.id,
                    "movement_type": "purchase_in",
                    "quantity": "5",
                    "target_location_id": self.location.id,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        balance.refresh_from_db()
        self.assertEqual(balance.on_hand, previous_stock + Decimal("5"))

    def test_checkout_and_return_updates_tracked_unit(self):
        self.client.force_login(self.storekeeper)
        unit = TrackedUnit.objects.filter(status=TrackedUnit.UnitStatus.AVAILABLE).first()

        checkout_response = self.client.post(
            "/api/checkouts/",
            data=json.dumps(
                {
                    "tracked_unit_id": unit.id,
                    "receiver_person_id": self.person.id,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(checkout_response.status_code, 201)
        unit.refresh_from_db()
        self.assertEqual(unit.status, TrackedUnit.UnitStatus.CHECKED_OUT)
        self.assertTrue(
            AssetCheckout.objects.filter(
                tracked_unit=unit,
                status=AssetCheckout.CheckoutStatus.OPEN,
            ).exists()
        )

        checkout_id = checkout_response.json()["item"]["id"]
        return_response = self.client.post(
            f"/api/checkouts/{checkout_id}/return/",
            data=json.dumps({}),
            content_type="application/json",
        )

        self.assertEqual(return_response.status_code, 200)
        unit.refresh_from_db()
        self.assertEqual(unit.status, TrackedUnit.UnitStatus.AVAILABLE)
        self.assertEqual(unit.current_location, self.location)

    def test_count_line_creates_discrepancy_and_supervisor_can_resolve_it(self):
        article = Article.objects.filter(tracking_mode=Article.TrackingMode.QUANTITY).first()
        initial_balance = InventoryBalance.objects.get(article=article, location=self.location)

        self.client.force_login(self.storekeeper)
        session_response = self.client.post(
            "/api/counts/",
            data=json.dumps({"count_type": "partial", "scope": "Conteo test"}),
            content_type="application/json",
        )
        self.assertEqual(session_response.status_code, 201)

        line_response = self.client.post(
            f"/api/counts/{session_response.json()['item']['id']}/lines/",
            data=json.dumps(
                {
                    "article_id": article.id,
                    "location_id": self.location.id,
                    "counter_person_id": self.person.id,
                    "counted_qty": "0",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(line_response.status_code, 201)

        discrepancy = StockDiscrepancy.objects.filter(article=article, status="open").latest("id")
        self.assertEqual(discrepancy.difference_type, StockDiscrepancy.DifferenceType.NEGATIVE)
        self.assertEqual(discrepancy.possible_cause, "")

        self.client.force_login(self.supervisor)
        resolve_response = self.client.post(
            f"/api/discrepancies/{discrepancy.id}/resolve/",
            data=json.dumps({"reason_text": "Conteo validado"}),
            content_type="application/json",
        )

        self.assertEqual(resolve_response.status_code, 200)
        discrepancy.refresh_from_db()
        initial_balance.refresh_from_db()
        self.assertEqual(discrepancy.status, StockDiscrepancy.DiscrepancyStatus.RESOLVED)
        self.assertEqual(initial_balance.on_hand, Decimal("0"))

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_safety_alert_rule_sends_mail_when_article_is_already_below_safety_stock(self):
        self.client.force_login(self.storekeeper)
        article = Article.objects.filter(tracking_mode=Article.TrackingMode.QUANTITY).first()
        balance = InventoryBalance.objects.get(article=article, location=self.location)
        article.safety_stock = balance.on_hand + Decimal("1")
        article.save(update_fields=["safety_stock"])

        response = self.client.post(
            "/api/inventory/safety-alerts/",
            data=json.dumps(
                {
                    "article_id": article.id,
                    "is_enabled": True,
                    "recipient_user_ids": [self.supervisor.id],
                    "notes": "Reponer urgente",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        rule = SafetyStockAlertRule.objects.get(article=article)
        self.assertEqual(rule.status, SafetyStockAlertRule.AlertStatus.TRIGGERED)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.supervisor.email, mail.outbox[0].to)
        self.assertIn(article.internal_code, mail.outbox[0].subject)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_safety_alert_mail_is_not_resent_until_stock_recovers(self):
        self.client.force_login(self.storekeeper)
        article = Article.objects.filter(tracking_mode=Article.TrackingMode.QUANTITY).first()
        balance = InventoryBalance.objects.get(article=article, location=self.location)
        previous_stock = balance.on_hand
        article.safety_stock = previous_stock - Decimal("1")
        article.save(update_fields=["safety_stock"])

        create_rule_response = self.client.post(
            "/api/inventory/safety-alerts/",
            data=json.dumps(
                {
                    "article_id": article.id,
                    "is_enabled": True,
                    "recipient_user_ids": [self.supervisor.id],
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(create_rule_response.status_code, 201)
        self.assertEqual(len(mail.outbox), 0)

        first_drop_qty = (previous_stock - article.safety_stock) + Decimal("1")
        first_drop_response = self.client.post(
            "/api/movements/",
            data=json.dumps(
                {
                    "article_id": article.id,
                    "movement_type": "consumption_out",
                    "quantity": str(first_drop_qty),
                    "source_location_id": self.location.id,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(first_drop_response.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)

        second_drop_response = self.client.post(
            "/api/movements/",
            data=json.dumps(
                {
                    "article_id": article.id,
                    "movement_type": "consumption_out",
                    "quantity": "1",
                    "source_location_id": self.location.id,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(second_drop_response.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)

        replenish_qty = article.safety_stock + Decimal("3")
        replenish_response = self.client.post(
            "/api/movements/",
            data=json.dumps(
                {
                    "article_id": article.id,
                    "movement_type": "purchase_in",
                    "quantity": str(replenish_qty),
                    "target_location_id": self.location.id,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(replenish_response.status_code, 201)
        rule = SafetyStockAlertRule.objects.get(article=article)
        self.assertEqual(rule.status, SafetyStockAlertRule.AlertStatus.MONITORING)

        drop_again_response = self.client.post(
            "/api/movements/",
            data=json.dumps(
                {
                    "article_id": article.id,
                    "movement_type": "consumption_out",
                    "quantity": str(replenish_qty),
                    "source_location_id": self.location.id,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(drop_again_response.status_code, 201)
        self.assertEqual(len(mail.outbox), 2)
