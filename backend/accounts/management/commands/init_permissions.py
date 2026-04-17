"""
Comando para inicializar los módulos y acciones de permisos base.
"""
from django.core.management.base import BaseCommand
from accounts.models import PermissionModule, PermissionAction, RolePermission, UserProfile


class Command(BaseCommand):
    help = "Inicializa los módulos y acciones de permisos base del sistema"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Inicializando módulos de permisos..."))

        # Crear módulos si no existen
        modules_data = [
            {
                "code": "inventory_overview",
                "name": "Panel de Inventario",
                "description": "Vista general del estado del inventario",
                "order": 1,
            },
            {
                "code": "stock_management",
                "name": "Gestión de Stock",
                "description": "Administración de artículos y stock",
                "order": 2,
            },
            {
                "code": "movements",
                "name": "Movimientos",
                "description": "Registro de entradas y salidas de inventario",
                "order": 3,
            },
            {
                "code": "checkouts",
                "name": "Retiros",
                "description": "Gestión de retiros y entregas",
                "order": 4,
            },
            {
                "code": "alarms",
                "name": "Alarmas",
                "description": "Sistema de alertas de stock bajo",
                "order": 5,
            },
            {
                "code": "counts",
                "name": "Conteos",
                "description": "Gestión de conteos y auditorías de stock",
                "order": 6,
            },
            {
                "code": "discrepancies",
                "name": "Discrepancias",
                "description": "Identificación y resolución de discrepancias",
                "order": 7,
            },
            {
                "code": "admin_users",
                "name": "Administración de Usuarios",
                "description": "Gestión de usuarios y permisos",
                "order": 8,
            },
            {
                "code": "reports",
                "name": "Reportes",
                "description": "Generación y visualización de reportes",
                "order": 9,
            },
            {
                "code": "settings",
                "name": "Configuración",
                "description": "Configuración del sistema",
                "order": 10,
            },
            {
                "code": "deposits_overview",
                "name": "Panel de Depósitos",
                "description": "Vista general del módulo Depósitos",
                "order": 11,
            },
            {
                "code": "pallet_registry",
                "name": "Registro de Pallets",
                "description": "Alta, consulta y mantenimiento de pallets",
                "order": 12,
            },
            {
                "code": "deposit_layout",
                "name": "Plano de Depósitos",
                "description": "Visualización y gestión del plano físico",
                "order": 13,
            },
            {
                "code": "pallet_scans",
                "name": "Escaneo de Pallets",
                "description": "Escaneo QR, lookup y reubicaciones",
                "order": 14,
            },
        ]

        modules_created = 0
        for module_data in modules_data:
            module, created = PermissionModule.objects.get_or_create(
                code=module_data["code"],
                defaults={
                    "name": module_data["name"],
                    "description": module_data["description"],
                    "order": module_data["order"],
                },
            )
            if created:
                modules_created += 1
                self.stdout.write(
                    self.style.SUCCESS(f"✓ Módulo creado: {module.name}")
                )

        self.stdout.write(
            self.style.SUCCESS(f"\nTotal módulos creados: {modules_created}")
        )

        # Crear acciones si no existen
        self.stdout.write(self.style.SUCCESS("\nInicializando acciones de permisos..."))

        actions_data = [
            {"code": "view", "name": "Ver", "description": "Permite visualizar"},
            {"code": "create", "name": "Crear", "description": "Permite crear nuevos registros"},
            {"code": "change", "name": "Editar", "description": "Permite editar registros existentes"},
            {"code": "delete", "name": "Eliminar", "description": "Permite eliminar registros"},
            {"code": "export", "name": "Exportar", "description": "Permite exportar datos"},
            {"code": "approve", "name": "Aprobar", "description": "Permite aprobar acciones"},
        ]

        actions_created = 0
        for action_data in actions_data:
            action, created = PermissionAction.objects.get_or_create(
                code=action_data["code"],
                defaults={
                    "name": action_data["name"],
                    "description": action_data["description"],
                },
            )
            if created:
                actions_created += 1
                self.stdout.write(
                    self.style.SUCCESS(f"✓ Acción creada: {action.name}")
                )

        self.stdout.write(
            self.style.SUCCESS(f"\nTotal acciones creadas: {actions_created}")
        )

        # Configurar permisos por rol
        self.stdout.write(self.style.SUCCESS("\nConfigurando permisos por rol..."))

        role_permissions_config = {
            UserProfile.Role.ADMINISTRATOR: {
                "inventory_overview": ["view"],
                "stock_management": ["view", "create", "change", "delete"],
                "movements": ["view", "create", "change", "delete"],
                "checkouts": ["view", "create", "change", "delete"],
                "alarms": ["view"],
                "counts": ["view", "create", "change", "delete"],
                "discrepancies": ["view", "create", "change", "delete"],
                "admin_users": ["view", "create", "change", "delete"],
                "reports": ["view", "export"],
                "settings": ["view", "change"],
                "deposits_overview": ["view"],
                "pallet_registry": ["view", "create", "change", "delete"],
                "deposit_layout": ["view", "create", "change", "delete"],
                "pallet_scans": ["view", "create", "change"],
            },
            UserProfile.Role.STOREKEEPER: {
                "inventory_overview": ["view"],
                "stock_management": ["view", "change"],
                "movements": ["view", "create"],
                "checkouts": ["view", "create"],
                "alarms": ["view"],
                "counts": ["view", "create"],
                "discrepancies": ["view"],
                "deposits_overview": ["view"],
                "pallet_registry": ["view", "create", "change", "delete"],
                "deposit_layout": ["view", "create", "change", "delete"],
                "pallet_scans": ["view", "create", "change"],
            },
            UserProfile.Role.SUPERVISOR: {
                "inventory_overview": ["view"],
                "stock_management": ["view", "change"],
                "movements": ["view"],
                "checkouts": ["view"],
                "alarms": ["view"],
                "counts": ["view", "create", "change"],
                "discrepancies": ["view"],
                "reports": ["view", "export"],
                "deposits_overview": ["view"],
                "pallet_registry": ["view"],
                "deposit_layout": ["view"],
                "pallet_scans": ["view", "create"],
            },
            UserProfile.Role.OPERATOR: {
                "inventory_overview": ["view"],
                "stock_management": ["view"],
                "movements": ["view", "create"],
                "checkouts": ["view", "create"],
                "alarms": ["view"],
                "deposits_overview": ["view"],
                "pallet_registry": ["view"],
                "deposit_layout": ["view"],
                "pallet_scans": ["view", "create"],
            },
            UserProfile.Role.AUDITOR: {
                "inventory_overview": ["view"],
                "stock_management": ["view"],
                "movements": ["view"],
                "checkouts": ["view"],
                "alarms": ["view"],
                "counts": ["view"],
                "discrepancies": ["view"],
                "reports": ["view", "export"],
                "deposits_overview": ["view"],
                "pallet_registry": ["view"],
                "deposit_layout": ["view"],
            },
            UserProfile.Role.MAINTENANCE: {
                "inventory_overview": ["view"],
                "movements": ["view", "create"],
            },
            UserProfile.Role.PURCHASING: {
                "inventory_overview": ["view"],
                "stock_management": ["view"],
                "movements": ["view", "create"],
                "reports": ["view", "export"],
            },
        }

        for role, modules in role_permissions_config.items():
            for module_code, action_codes in modules.items():
                module = PermissionModule.objects.get(code=module_code)
                actions = PermissionAction.objects.filter(code__in=action_codes)

                role_perm, created = RolePermission.objects.get_or_create(
                    role=role,
                    module=module,
                )

                role_perm.actions.set(actions)

                if created:
                    role_display = dict(UserProfile.Role.choices).get(role, role)
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"✓ Permisos configurados: {role_display} - {module.name}"
                        )
                    )

        self.stdout.write(
            self.style.SUCCESS("\n✅ Inicialización de permisos completada exitosamente!")
        )
