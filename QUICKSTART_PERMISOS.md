# ⚡ Guía Rápida - Sistema de Permisos

## 📌 Lo que acabas de recibir

Un sistema completo de gestión de permisos en el panel admin de Django que permite:

✅ Controlar qué módulos pueden ver los usuarios (Inventario, Stock, Reportes, etc.)  
✅ Controlar qué acciones pueden hacer (Ver, Crear, Editar, Eliminar)  
✅ Crear reglas específicas para cada usuario  
✅ Restringir acceso a sectores específicos del almacén  
✅ Heredar permisos del rol pero permitir excepciones  

---

## 🚀 Primeros Pasos

### 1. ¿Ya migraste la BD? 
```bash
# Solo si no lo hiciste:
python manage.py migrate
python manage.py init_permissions
```

### 2. Abre el Admin y ve a:
```
http://localhost:8000/admin/
→ Administración de Usuarios → Permisos de Roles
```

Aquí verás que ya hay permisos preseteados para cada rol:
- Administrador: acceso a todo
- Deposito/Panolero: stock, movimientos, conteos
- Supervisor: supervisión y reportes
- Operario: operaciones básicas
- etc.

### 3. Crea un Usuario Nuevo y Personaliza sus Permisos

**Opción A - Usuario normal que hereda el rol:**
1. Crea usuario "pepito" con rol "Operario"
2. Va a: Permisos de Usuarios → Encuentra "pepito"
3. Marca "Hereda del rol" ✓
4. Haz clic en "Agregar permiso de módulo específico"
5. Selecciona "Reportes", marca "Ver" ✓ y "Exportar" ✓
6. ¡Listo! Pepito ahora es Operario + puede ver reportes

**Opción B - Usuario super restringido:**
1. Crea usuario "juan" con rol "Operario"
2. Va a: Permisos de Usuarios → Encuentra "juan"
3. Desmarca "Hereda del rol" ✗
4. Agrega UN permiso: "Panel de Inventario" → "Ver" ✓
5. ¡Listo! Juan solo ve el panel, nada más

**Opción C - Denegar acceso temporal:**
1. Usuario es "Deposito" pero de vacaciones
2. Va a: Permisos de Usuarios → Encuentra el usuario
3. Agrega permiso: Módulo "Gestión de Stock", Sin acciones seleccionadas, Allow = ✗
4. ¡Listo! Revoca el acceso a stock aunque su rol lo tenga

### 4. Restringir por Sectores

Para que un usuario solo trabaje en ciertos sectores:

1. Va a: Permisos de Sectores
2. Haz clic en "Agregar"
3. Usuario: selecciona usuario
4. Sector: selecciona sector (ej: "Electrónica")
5. Marca: Ver ✓, Editar ✓, Eliminar ✗
6. ¡Listo! El usuario solo trabaja en ese sector

---

## 📚 Archivos Clave

- **[PERMISOS.md](PERMISOS.md)** - Documentación completa (te recomiendo leerla)
- **[accounts/permissions.py](accounts/permissions.py)** - Funciones helper
- **[accounts/models.py](accounts/models.py)** - Todos los modelos
- **[accounts/admin.py](accounts/admin.py)** - Interfaces del admin
- **[views_permissions_examples.py](accounts/views_permissions_examples.py)** - Ejemplos de código

---

## 💡 Casos de Uso Comunes

### "Quiero que pepito vea y edite stock pero no pueda crear"
```
Rol: Deposito/Panolero ← ya lo tiene
Módulo: Gestión de Stock
Acciones: Ver ✓, Cambiar ✓, Crear ✗, Eliminar ✗
Allow: ✓ (Permite)
```

### "Quiero que carlos solo vea reportes"
```
Hereda el rol: ✗ (NO)
Módulo: Reportes
Acciones: Ver ✓, Exportar ✓
```

### "Quiero revocar acceso temporal a maria"
```
Usuario actual: María (con varios permisos)
Módulo: Gestión de Stock
Acciones: (ninguna seleccionada)
Allow: ✗ (Deniega)
```

### "Quiero que luis trabaje en 2 sectores pero no en otro"
```
→ Permisos de Sectores
Usuario: Luis
Sector 1: Electrónica - Ver ✓, Editar ✓
Sector 2: Mecánica - Ver ✓, Editar ✓
(No crear permiso para → Consumibles)
```

---

## 🎯 En el Código - Cómo Usarlo

### En Vistas Django

```python
from accounts.permissions import has_module_permission, permission_required

# Verificar en vista
@api_view(['GET'])
def stock_view(request):
    if has_module_permission(request.user, 'stock_management', 'view'):
        # mostrar stock
    else:
        return JsonResponse({'error': 'Sin permisos'}, status=403)

# O usar decorador
@permission_required('stock_management', 'view')
def stock_api(request):
    # automáticamente protegida
    ...
```

### En el Frontend (React)

```python
# En tu endpoint
from accounts.permissions import get_user_accessible_modules

@api_view(['GET'])
def get_menu(request):
    modules = get_user_accessible_modules(request.user)
    return Response({
        'can_see_stock': 'stock_management' in modules,
        'can_edit_stock': 'change' in modules['stock_management']['actions'],
        'can_see_reports': 'reports' in modules,
    })
```

Luego en React:
```jsx
// Mostrar botón solo si tiene permisos
{permissions.can_edit_stock && <button>Editar Stock</button>}
```

---

## ⚠️ Importante

1. **Admins** (is_staff=True) siempre pueden hacer todo
2. **Usuarios inactivos** no pueden acceder a nada
3. **Los cambios son instantáneos** (sin logout)
4. **Las señales automáticas** crean UserPermission cuando se crea usuario
5. **Herencia + Custom** = se suman permisos (si permiso específico está en "Allow")

---

## 🔍 Debug

### Verificar permisos de un usuario en shell

```bash
python manage.py shell

from django.contrib.auth.models import User
from accounts.permissions import has_module_permission, get_user_accessible_modules

user = User.objects.get(username='pepito')

# ¿Pepito puede ver stock?
has_module_permission(user, 'stock_management', 'view')  # True/False

# ¿Qué módulos puede ver pepito?
get_user_accessible_modules(user)
# {'inventory_overview': {'module': 'Panel de Inventario', 'actions': ['view']}, ...}
```

---

## 📞 Problemas Comunes

**P: "Cambié permisos pero no funcionan"**
A: Los cambios son instantáneos. Limpia caché si usas Redis, o refresca página.

**P: "Usuario no ve ningún módulo"**
A: Verifica que:
- Usuario está activo (status = "Activo")
- En Permisos de Usuarios tiene permisos asignados
- Si "Hereda del rol", revisa que el rol tenga permisos

**P: "¿Cómo deniego acceso a un usuario sin eliminar su cuenta?"**
A: En Permisos de Usuarios, agrega permiso con Allow = ✗

---

## ✅ Próximos Pasos

1. Lee [PERMISOS.md](PERMISOS.md) para documentación completa
2. Crea un usuario de prueba y experimenta en el admin
3. Revisa [views_permissions_examples.py](accounts/views_permissions_examples.py) para código
4. Integra `@permission_required()` en tus vistas
5. Usa `get_user_accessible_modules()` para UI dinámico

---

¡Listo! Ya tienes un sistema de permisos profesional funcionando. 🎉
