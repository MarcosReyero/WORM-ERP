import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from inventory.models import Sector

from .models import UserProfile


class AuthApiTests(TestCase):
    def setUp(self):
        """Maneja setUp."""
        self.client = Client(enforce_csrf_checks=True)
        self.user = get_user_model().objects.create_user(
            username="tester",
            password="StrongPass123",
        )

    def test_login_creates_authenticated_session(self):
        """Maneja test login creates authenticated session."""
        self.user.profile.role = UserProfile.Role.STOREKEEPER
        self.user.profile.save(update_fields=["role"])

        csrf_response = self.client.get("/api/auth/csrf/")
        csrf_token = csrf_response.cookies["csrftoken"].value

        response = self.client.post(
            "/api/auth/login/",
            data=json.dumps(
                {
                    "username": "tester",
                    "password": "StrongPass123",
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["username"], self.user.username)
        self.assertEqual(response.json()["user"]["role"], UserProfile.Role.STOREKEEPER)

        session_response = self.client.get("/api/auth/session/")
        self.assertEqual(session_response.status_code, 200)
        self.assertTrue(session_response.json()["authenticated"])
        self.assertIn("preferred_theme", session_response.json()["user"])
        self.assertIn("unread_messages_count", session_response.json()["user"])
        self.assertIn("open_alarm_count", session_response.json()["user"])

    def test_inactive_profile_cannot_login(self):
        """Maneja test inactive profile cannot login."""
        self.user.profile.status = UserProfile.Status.INACTIVE
        self.user.profile.save(update_fields=["status"])

        csrf_response = self.client.get("/api/auth/csrf/")
        csrf_token = csrf_response.cookies["csrftoken"].value
        response = self.client.post(
            "/api/auth/login/",
            data=json.dumps(
                {
                    "username": "tester",
                    "password": "StrongPass123",
                }
            ),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        self.assertEqual(response.status_code, 403)


class AdminProfileApiTests(TestCase):
    def setUp(self):
        """Maneja setUp."""
        user_model = get_user_model()
        self.client = Client()
        self.admin = user_model.objects.create_user(
            username="adminuser",
            password="StrongPass123",
        )
        self.admin.profile.role = UserProfile.Role.ADMINISTRATOR
        self.admin.profile.save(update_fields=["role"])

        self.operator = user_model.objects.create_user(
            username="operator",
            password="StrongPass123",
        )
        self.sector, _ = Sector.objects.get_or_create(
            code="PROD",
            defaults={"name": "Produccion"},
        )

    def test_admin_can_create_update_and_reset_profile(self):
        """Maneja test admin can create update and reset profile."""
        self.client.force_login(self.admin)

        create_response = self.client.post(
            "/api/auth/admin/profiles/",
            data={
                "username": "newuser",
                "password": "InitialPass123",
                "first_name": "Nuevo",
                "last_name": "Usuario",
                "role": UserProfile.Role.MAINTENANCE,
                "sector_default_id": self.sector.id,
            },
        )
        self.assertEqual(create_response.status_code, 201)
        created_id = create_response.json()["item"]["id"]

        update_response = self.client.post(
            f"/api/auth/admin/profiles/{created_id}/",
            data={
                "phone": "+54 11 5555 1234",
                "status": UserProfile.Status.INACTIVE,
                "preferred_theme": UserProfile.PreferredTheme.DARK,
            },
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["item"]["status"], UserProfile.Status.INACTIVE)
        self.assertEqual(update_response.json()["item"]["phone"], "+54 11 5555 1234")

        reset_response = self.client.post(
            f"/api/auth/admin/profiles/{created_id}/reset-password/",
            data=json.dumps({"new_password": "ResetPass123"}),
            content_type="application/json",
        )
        self.assertEqual(reset_response.status_code, 200)

        created_user = get_user_model().objects.get(pk=created_id)
        self.assertTrue(created_user.check_password("ResetPass123"))

    def test_non_admin_cannot_list_profiles(self):
        """Maneja test non admin cannot list profiles."""
        self.client.force_login(self.operator)
        response = self.client.get("/api/auth/admin/profiles/")
        self.assertEqual(response.status_code, 403)
