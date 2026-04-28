from django.urls import path

from .views import (
    admin_profile_detail,
    admin_profile_reset_password,
    admin_profiles,
    admin_permissions_meta,
    admin_role_permissions,
    admin_user_permissions,
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
    path("admin/permissions/meta/", admin_permissions_meta, name="admin-permissions-meta"),
    path("admin/permissions/roles/<str:role_code>/", admin_role_permissions, name="admin-role-permissions"),
    path(
        "admin/permissions/users/<int:profile_user_id>/",
        admin_user_permissions,
        name="admin-user-permissions",
    ),
]
