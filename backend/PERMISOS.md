# Sistema de Permisos - Documentación

## 📋 Descripción General

El sistema de permisos permite un control granular sobre qué pueden hacer los usuarios en la plataforma. Está diseñado en tres capas:

1. **Permisos por Rol**: Base de permisos que se asignan a cada tipo de rol (Administrador, Operario, etc.)
2. **Permisos de Usuario Individual**: Personalizaciones específicas que sobrescriben o extienden los permisos del rol
3. **Permisos de Sector**: Acceso restringido a sectores específicos del almacén

---

## 🎯 Conceptos Clave

### Módulos
Son las secciones principales de la plataforma:
- **Panel de Inventario**: Vista general del estado del inventario
- **Gestión de Stock**: Administración de artículos y stock
- **Movimientos**: Registro de entradas y salidas
- **Retiros**: Gestión de retiros y entregas
- **Alarmas**: Sistema de alertas de stock bajo
- **Conteos**: Auditorías y conteos de inventario
- **Discrepancias**: Identificación y resolución de discrepancias
- **Administración de Usuarios**: Gestión de usuarios y permisos
- **Reportes**: Generación de reportes
- **Configuración**: Configuración del sistema

### Acciones
Son las operaciones que se pueden realizar dentro de un módulo:
- **Ver**: Visualizar información
- **Crear**: Crear nuevos registros
- **Editar**: Modificar registros existentes
- **Eliminar**: Borrar registros
- **Exportar**: Exportar datos
- **Aprobar**: Aprobar acciones (para workflows)

### Roles Base
Cada usuario tiene un rol que determina sus permisos iniciales:
- **Administrador**: Acceso total a todo
- **Deposito/Panolero**: Gestión completa de stock y movimientos
- **Supervisor**: Supervisión y reportes
- **Operario**: Operaciones básicas
- **Auditor**: Solo lectura con acceso a reportes
- **Mantenimiento**: Operario con permisos limitados
- **Compras**: Gestión de compras y stock

---

## 🔧 Cómo Usar - Guía Admin

### 1. Ver y Editar Permisos por Rol

Para configurar qué puede hacer cada rol:

1. Ve a **Administración de Usuarios > Permisos de Roles**
2. Selecciona el rol y módulo que quieres editar (ej: "Deposito/Panolero - Gestión de Stock")
3. Marca las acciones permitidas (Ver, Crear, Editar, etc.)
4. Guarda

**Ejemplo**: Para que el rol "Operario" solo pueda ver y crear movimientos, pero no editar:
- Módulo: "Movimientos"
- Acciones: "Ver" ✓, "Crear" ✓, "Editar" ✗, "Eliminar" ✗

### 2. Personalizar Permisos de Usuario Individual

Para dar permisos específicos a un usuario que va más allá de su rol:

1. Ve a **Administración de Usuarios > Permisos de Usuarios**
2. Selecciona el usuario
3. **Si quieres que HEREDA el rol + tenga permisos extras**:
   - Marca "Hereda del rol" ✓
   - En la sección "Permisos de módulos específicos", agrega nuevos módulos/acciones
   
4. **Si quieres que SOLO tenga permisos específicos**:
   - Desmarca "Hereda del rol" ✗
   - Define solo los módulos/acciones que necesita

**Ejemplo 1 - Extender permisos**: 
Usuario "Pepito" es Operario pero necesita acceso a la sección de Reportes:
- "Hereda del rol" = ✓ (hereda permisos de Operario)
- Agregar permiso específico: Módulo "Reportes", Acciones: "Ver" ✓, "Exportar" ✓

**Ejemplo 2 - Restringir acceso**:
Usuario "Juan" es Deposito pero NO debe editar artículos:
- "Hereda del rol" = ✓
- Agregar permiso específico: Módulo "Gestión de Stock", Acciones: NINGUNA, Allow = ✗ (esto nega/revoca el acceso)

### 3. Asignar Acceso a Sectores Específicos

Para que un usuario solo tenga acceso a ciertos sectores del almacén:

1. Ve a **Administración de Usuarios > Permisos de Sectores**
2. Haz clic en "Agregar"
3. Selecciona el usuario y el sector
4. Marca los permisos:
   - **Ver**: puede visualizar el sector
   - **Editar**: puede modificar artículos en el sector
   - **Eliminar**: puede eliminar artículos en el sector

**Ejemplo**: 
Usuario "Carlos" solo puede ver y editar artículos en el sector "Electrónica":
- Usuario: Carlos
- Sector: Electrónica
- Ver ✓, Editar ✓, Eliminar ✗

---

## 💻 Cómo Usar - En el Código (Desarrolladores)

### Verificar Permiso en Vistas

```python
from accounts.permissions import has_module_permission, permission_required

# Método 1: Verificación manual
def stock_view(request):
    if has_module_permission(request.user, 'stock_management', 'view'):
        # Mostrar datos
        ...
    else:
        return JsonResponse({'error': 'Sin permisos'}, status=403)

# Método 2: Decorador
@permission_required('inventory_overview', 'view')
def dashboard_view(request):
    # Solo permite si tiene permiso de ver en inventory_overview
    ...
```

### Obtener Todos los Módulos Accesibles del Usuario

```python
from accounts.permissions import get_user_accessible_modules

# Retorna dict con módulos y acciones disponibles
modules = get_user_accessible_modules(request.user)
# {'inventory_overview': {'module': 'Panel de Inventario', 'actions': ['view']}, ...}

# Usar en frontend
return JsonResponse({'accessible_modules': modules})
```

### Verificar Acceso a Sectores

```python
from accounts.permissions import has_sector_permission, get_user_accessible_sectors

# Verificar acceso a un sector específico
sector = Sector.objects.get(pk=1)
if has_sector_permission(request.user, sector, action='edit'):
    # Permitir edición
    ...

# Obtener todos los sectores accesibles
accessible_sectors = get_user_accessible_sectors(request.user)
```

### En Templates (Frontend)

```python
# En una vista, pasar los módulos accesibles al template
def api_modules(request):
    modules = get_user_accessible_modules(request.user)
    sectors = get_user_accessible_sectors(request.user)
    return JsonResponse({
        'modules': modules,
        'sectors': list(sectors.values_list('id', 'name'))
    })
```

---

## 🎨 Interfaz Admin Mejorada

El admin de Django ahora tiene varias mejoras:

### Dashboard de Permisos de Usuarios
- Vista de todos los usuarios con sus permisos
- Indicador visual si hereda del rol o tiene permisos custom
- Cantidad de módulos y sectores personalizados
- Link directo para editar permisos

### Vista de Sectores
- Tabla clara de qué usuario puede hacer qué en cada sector
- Iconos visuales (👁 Ver, ✏ Editar, 🗑 Eliminar)

### Configuración de Roles
- Editor de permisos por rol centralizado
- Aplica cambios a TODOS los usuarios de ese rol instantáneamente

---

## 📊 Ejemplos de Configuración

### Caso 1: Operario que solo ve y crea movimientos

1. Rol: **Operario** (ya tiene acceso limitado)
2. Módulo: **Movimientos** -> Acciones: Ver ✓, Crear ✓
3. (Otros módulos heredan del rol: Panel ✓, Stock vista, Retiros ✓)
4. No necesita permisos específicos

### Caso 2: Depositor que va a hacer auditoría

1. Rol: **Deposito/Panolero**
2. Módulo existentes: Stock, Movimientos, Retiros, Conteos...
3. **Agregar permiso específico**: 
   - Módulo: "Reportes" -> Ver ✓, Exportar ✓

### Caso 3: Usuario temporal que solo ve inventario

1. Rol: **Operario**
2. Desmarca "Hereda del rol"
3. **Agregar único permiso específico**:
   - Módulo: "Panel de Inventario" -> Ver ✓
4. Solo verá el panel, nada más

### Caso 4: Revocar acceso temporal

1. Usuario es **Deposito** pero durante vacaciones no debe editar
2. Módulo: "Gestión de Stock"
3. Acciones: ninguna seleccionada
4. Allow = ✗ (Deniega)
5. Con esto, revoca el acceso a Stock aunque su rol lo tenga

---

## ⚠️ Notas Importantes

1. **Administradores (is_staff=True)** siempre tienen acceso a todo, sin importar los permisos
2. **Usuarios inactivos** no tienen acceso a nada
3. Los cambios de permisos son **instantáneos** (sin necesidad de logout)
4. Los **permisos específicos son aditivos** si "Hereda del rol" está marcado
5. Para **denegar acceso**, desactiva todos los permisos en un módulo y marca Allow = ✗

---

## 🚀 Desarrollo Futuro

Posibles mejoras:
- [ ] Permisos basados en atributos (campo dinámico)
- [ ] Auditoría de cambios de permisos
- [ ] Interfaz Vue/React para gestión de permisos desde frontend
- [ ] Expiración de permisos temporales
- [ ] Permisos por horario
- [ ] Notificaciones de cambios de permisos

---

## 📞 Soporte

Para problemas o preguntas sobre el sistema de permisos:
1. Revisa los logs del admin en Django
2. Verifica que el usuario _profile_ existe
3. Asegúrate de que _inherit_role_permissions_ esté configurado correctamente
4. Comprueba que el módulo y acciones existan en la base de datos
