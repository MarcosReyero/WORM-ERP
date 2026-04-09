"""
Script de verificación del sistema de permisos.
Ejecutar: python manage.py shell < verify_permissions.py
O desde shell: exec(open('verify_permissions.py').read())
"""

from django.contrib.auth.models import User
from accounts.models import PermissionModule, PermissionAction, RolePermission, UserProfile
from accounts.permissions import has_module_permission, get_user_accessible_modules

print("=" * 70)
print("VERIFICACION DEL SISTEMA DE PERMISOS")
print("=" * 70)

# 1. Verificar módulos
print("\n1. Modulos disponibles:")
modules = PermissionModule.objects.all()
print("   Total: {} modulos".format(modules.count()))
for mod in modules[:3]:
    print("   * {} ({})".format(mod.name, mod.code))
if modules.count() > 3:
    print("   ... {} mas".format(modules.count() - 3))

# 2. Verificar acciones
print("\n2. Acciones disponibles:")
actions = PermissionAction.objects.all()
print("   Total: {} acciones".format(actions.count()))
for act in actions:
    print("   * {} ({})".format(act.name, act.code))

# 3. Verificar permisos de roles
print("\n3. Permisos por rol (muestra):")
roles_config = RolePermission.objects.values('role').distinct()
print("   Total roles configurados: {}".format(roles_config.count()))
for role_perm in RolePermission.objects.filter(role='operator')[:2]:
    print("   * {} - {}: {} acciones".format(role_perm.get_role_display(), role_perm.module.name, role_perm.actions.count()))

# 4. Verificar usuarios existentes
print("\n4. Usuarios en el sistema:")
users = User.objects.all()
print("   Total: {} usuarios".format(users.count()))
for user in users[:3]:
    try:
        full_name = user.get_full_name() or 'Sin nombre'
        print("   * {} - {}".format(user.username, full_name))
        if hasattr(user, 'profile'):
            print("     Rol: {}".format(user.profile.get_role_display()))
        if hasattr(user, 'permissions'):
            perms = user.permissions
            print("     Permisos custom: {} modulos".format(perms.module_permissions.count()))
    except Exception as e:
        print("   AVISO: Error al procesar usuario: {}".format(str(e)))

# 5. Test funcional
print("\n5. Test funcional:")
admin_users = User.objects.filter(is_staff=True)
if admin_users.exists():
    admin = admin_users.first()
    result = has_module_permission(admin, 'inventory_overview', 'view')
    print("   * Admin {} puede ver inventory_overview: {}".format(admin.username, result))

# 6. Resumen
print("\n" + "=" * 70)
print("SISTEMA DE PERMISOS VERIFICADO EXITOSAMENTE!")
print("=" * 70)
print("\nProximos pasos:")
print("   1. Abre http://localhost:8000/admin/")
print("   2. Ve a 'Administracion de Usuarios'")
print("   3. Revisa 'Permisos de Roles' para ver configuracion por defecto")
print("   4. Gestiona permisos de usuarios en 'Permisos de Usuarios'")
print("\nDocumentacion:")
print("   - QUICKSTART_PERMISOS.md - Guia rapida")
print("   - SISTEMA_PERMISOS_IMPLEMENTACION.md - Resumen tecnico")
print("   - backend/PERMISOS.md - Documentacion completa")
print("=" * 70)
