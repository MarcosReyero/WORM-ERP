"""
Comando para crear usuarios de demostración con diferentes permisos.
Útil para testing y demostración del sistema.

Uso: python manage.py create_demo_users
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from accounts.models import UserProfile, UserPermission, UserModulePermission, PermissionModule, PermissionAction


class Command(BaseCommand):
    help = "Crea usuarios de demostración con diferentes configuraciones de permisos"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Creando usuarios de demostración..."))

        # Datos de usuarios demo
        demo_users = [
            {
                "username": "pepito_operario",
                "password": "pass123",
                "first_name": "Pepito",
                "last_name": "García",
                "email": "pepito@example.com",
                "role": "operator",
                "description": "Operario básico - solo puede ver y crear movimientos",
                "custom_permissions": {
                    "inherit_role": True,
                    "modules": [
                        # No agregar nada, usa el rol por defecto
                    ]
                }
            },
            {
                "username": "maria_deposito",
                "password": "pass123",
                "first_name": "María",
                "last_name": "López",
                "email": "maria@example.com",
                "role": "storekeeper",
                "description": "Panolera con acceso a stock, movimientos y reportes",
                "custom_permissions": {
                    "inherit_role": True,
                    "modules": [
                        {
                            "code": "reports",
                            "actions": ["view", "export"],
                            "allow": True,
                        }
                    ]
                }
            },
            {
                "username": "carlos_auditor",
                "password": "pass123",
                "first_name": "Carlos",
                "last_name": "Pérez",
                "email": "carlos@example.com",
                "role": "auditor",
                "description": "Auditor - solo lectura con reportes",
                "custom_permissions": {
                    "inherit_role": True,
                    "modules": []
                }
            },
            {
                "username": "juan_restringido",
                "password": "pass123",
                "first_name": "Juan",
                "last_name": "Martínez",
                "email": "juan@example.com",
                "role": "operator",
                "description": "Operario muy restringido - solo puede ver panel",
                "custom_permissions": {
                    "inherit_role": False,  # No hereda del rol
                    "modules": [
                        {
                            "code": "inventory_overview",
                            "actions": ["view"],
                            "allow": True,
                        }
                    ]
                }
            },
            {
                "username": "admin_test",
                "password": "pass123",
                "first_name": "Admin",
                "last_name": "Test",
                "email": "admin@example.com",
                "role": "administrator",
                "description": "Administrador de prueba",
                "custom_permissions": {
                    "inherit_role": True,
                    "modules": []
                }
            },
        ]

        created_count = 0

        for user_data in demo_users:
            # Verificar que el usuario no exista
            if User.objects.filter(username=user_data["username"]).exists():
                self.stdout.write(
                    self.style.WARNING(f"⚠ Usuario {user_data['username']} ya existe, saltando...")
                )
                continue

            # Crear usuario
            user = User.objects.create_user(
                username=user_data["username"],
                password=user_data["password"],
                first_name=user_data["first_name"],
                last_name=user_data["last_name"],
                email=user_data["email"],
            )

            # Crear perfil
            UserProfile.objects.create(
                user=user,
                role=user_data["role"],
            )

            # Crear permisos
            user_perm = UserPermission.objects.create(
                user=user,
                inherit_role_permissions=user_data["custom_permissions"]["inherit_role"],
            )

            # Agregar permisos personalizados si existen
            for module_perm in user_data["custom_permissions"]["modules"]:
                module = PermissionModule.objects.get(code=module_perm["code"])
                actions = PermissionAction.objects.filter(code__in=module_perm["actions"])

                UserModulePermission.objects.create(
                    user_permission=user_perm,
                    module=module,
                    allow=module_perm["allow"],
                )
                # Agregar las acciones
                umod = UserModulePermission.objects.get(
                    user_permission=user_perm,
                    module=module,
                )
                umod.actions.set(actions)

            created_count += 1

            role_display = dict(UserProfile.Role.choices).get(user_data["role"], user_data["role"])
            self.stdout.write(
                self.style.SUCCESS(f"✓ Usuario creado: {user_data['username']} ({role_display})")
            )
            self.stdout.write(f"  Descripción: {user_data['description']}")
            self.stdout.write(f"  Contraseña: {user_data['password']} (cambiar después!)")

        self.stdout.write(
            self.style.SUCCESS(
                f"\n✅ Total {created_count} usuarios de demostración creados exitosamente!"
            )
        )
        self.stdout.write(
            self.style.WARNING(
                "\n⚠ IMPORTANTE: Cambia las contraseñas de estos usuarios en admin!"
            )
        )
