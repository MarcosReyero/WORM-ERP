from django.contrib import admin

from .models import UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "status", "sector_default", "phone", "preferred_theme", "last_access")
    list_filter = ("role", "status", "sector_default", "preferred_theme")
    search_fields = ("user__username", "user__first_name", "user__last_name")
