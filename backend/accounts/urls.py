from django.urls import path

from .views import (
    admin_profile_detail,
    admin_profile_reset_password,
    admin_profiles,
    csrf,
    login_view,
    logout_view,
    profile_view,
    session_status,
)

urlpatterns = [
    path("csrf/", csrf, name="csrf"),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),
    path("session/", session_status, name="session"),
    path("profile/", profile_view, name="profile"),
    path("admin/profiles/", admin_profiles, name="admin-profiles"),
    path("admin/profiles/<int:profile_user_id>/", admin_profile_detail, name="admin-profile-detail"),
    path(
        "admin/profiles/<int:profile_user_id>/reset-password/",
        admin_profile_reset_password,
        name="admin-profile-reset-password",
    ),
]
