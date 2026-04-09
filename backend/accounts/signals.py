from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import UserProfile, UserPermission


@receiver(post_save, sender=get_user_model())
def ensure_user_profile(sender, instance, created, **kwargs):
    """Crear perfil de usuario cuando se crea un usuario nuevo"""
    if created:
        role = UserProfile.Role.ADMINISTRATOR if instance.is_superuser else UserProfile.Role.OPERATOR
        UserProfile.objects.get_or_create(
            user=instance,
            defaults={"role": role},
        )


@receiver(post_save, sender=get_user_model())
def ensure_user_permissions(sender, instance, created, **kwargs):
    """Crear permisos de usuario cuando se crea un usuario nuevo"""
    if created:
        UserPermission.objects.get_or_create(
            user=instance,
            defaults={"inherit_role_permissions": True},
        )
