# Flujo General del Sistema de Inventario

Este diagrama muestra la arquitectura completa del sistema desde que un usuario inicia sesión hasta que interactúa con diferentes módulos del inventario.

## Vista General

```mermaid
---
id: 7f29e6bf-9e2a-427f-8cc0-7cf0ea5ff421
---
graph TD
    A["👤 Usuario"] -->|Login| B["🔐 Autenticación<br/>Django Auth"]
    B -->|Token/Session| C["📱 Frontend React<br/>InventoryLayout"]
    
    C -->|Tab: Resumen| D["📊 Overview Page"]
    C -->|Tab: Stock| E["📦 Stock Page"]
    C -->|Tab: Movimientos| F["🔄 Movements Page"]
    C -->|Tab: Préstamos| G["📤 Checkouts Page"]
    C -->|Tab: Conteos| H["📋 Counts Page"]
    C -->|Tab: Diferencias| I["⚠️ Discrepancies Page"]
    C -->|Tab: Alarmas| J["🔔 Alarms Page"]
    
    D -->|GET /overview/| K["Backend<br/>views.py"]
    E -->|GET /articles/| K
    F -->|POST /movements/| K
    G -->|POST /checkouts/| K
    H -->|POST /counts/| K
    I -->|POST /discrepancies/| K
    J -->|POST /alarms/| K
    
    K -->|Valida| L["🛡️ Services.py<br/>Lógica de Negocio"]
    L -->|CRUD| M["💾 Models.py<br/>ORM Django"]
    M -->|Queries| N["🗄️ PostgreSQL/SQLite<br/>Base de Datos"]
    
    N -->|Read/Write| O["📊 Datos Persistentes:<br/>Articles, Movements,<br/>Balances, Tracked Units"]
    
    L -->|Crea evento| P["📧 Automatización<br/>InventoryAutomationRunner"]
    P -->|Si stock bajo| Q["🔔 Evalúa<br/>SafetyStockAlert"]
    Q -->|Transición| R["✉️ Envía Email<br/>Django Mail"]
    R -->|SMTP| S["📬 Servidor Email"]
    
    P -->|Cada periodo| T["📋 Calcula<br/>MinimumStockDigest"]
    T -->|Daily/Weekly| U["📊 Genera Reporte"]
    U -->|SMTP| S
    
    L -->|Log de auditoría| V["📝 StockMovement<br/>AssetCheckout<br/>PhysicalCountLine"]
    
    W["🔄 Validaciones Transaccionales"] -.->|Ejecuta en| L
    X["🔐 Permisos por Rol"] -.->|Controla| K
    
    style A fill:#e1f5ff
    style B fill:#fff3e0
    style C fill:#f3e5f5
    style D fill:#e8f5e9
    style K fill:#fce4ec
    style L fill:#ede7f6
    style M fill:#e0f2f1
    style N fill:#fff9c4
    style O fill:#ffe0b2
    style P fill:#f1f8e9
    style Q fill:#ffccbc
    style R fill:#ffccbc
    style S fill:#ffccbc
```

## Componentes Principales

### 🔐 Capa de Autenticación
- Django Auth valida credenciales del usuario
- Genera token/session para usar la API

### 📱 Frontend React
- InventoryLayout es el contenedor principal
- 7 pestañas para diferentes operaciones
- utils.js para validaciones y formateo

### 🔌 API REST (Backend)
- Endpoints en views.py
- Decoradores para autenticación y validación de roles
- Rutas definidas en urls.py

### ⚙️ Lógica de Negocio (Services)
- services.py centraliza la lógica
- CRUD operations
- Validaciones transaccionales
- Cálculo de stocks

### 💾 Datos (ORM Django)
- models.py define la estructura
- ORM Django traduce a SQL
- Base de datos persiste los datos

### 🤖 Automatización
- Thread InventoryAutomationRunner corre continuamente
- Evalúa alertas de stock mínimo
- Envía emails automáticamente

### 📧 Externa
- Django Mail integra con SMTP
- Envía notificaciones a usuarios

## Flujo de Datos Típico

1. Usuario accede a module/stock
2. Frontend llama GET /api/articles/
3. Backend autentica usuario
4. Services obtiene artículos de BD
5. Frontend renderiza tabla
6. Usuario hace cambio (ej: crear movimiento)
7. Frontend POST a /api/inventory/movements/
8. Backend valida, actualiza BD
9. Automatización detecta cambio
10. Si es crítico, envía email

## Consideraciones

- ✅ Todas las operaciones requieren autenticación
- ✅ Permisos basados en rol (STOREKEEPER, SUPERVISOR, etc)
- ✅ Auditoría registra quién hizo qué y cuándo
- ✅ Automatización es asincrónica (no bloquea API)
- ⚠️ Emails pueden fallar (retry manejo en automación)
