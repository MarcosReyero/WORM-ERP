# 📊 Diagramas del Sistema de Inventario

Documentación visual de la arquitectura y flujos del módulo de inventario.

## Índice de Diagramas

### 📐 Arquitectura
- **[01_flujo_general.md](./01_flujo_general.md)** - Flujo General del Sistema
  - Estructura completa: usuario → frontend → backend → bd
  - Integración con automatización y emails
  - Todas las vistas principales

### 🔄 Flujos de Procesos Principales
- **[02_flujo_movimientos.md](./02_flujo_movimientos.md)** - Flujo Detallado de Movimiento de Stock
  - Creación de movimientos (ingreso, salida, transferencia)
  - Validaciones transaccionales
  - Disparadores de alertas
  - Auditoría

- **[05_flujo_checkout.md](./05_flujo_checkout.md)** - Flujo Completo de Préstamo (Checkout)
  - Crear préstamo de unidades trazadas
  - Devolución de préstamos
  - Validaciones de permisos
  - Transacciones

- **[06_flujo_conteo.md](./06_flujo_conteo.md)** - Flujo de Conteo Físico
  - Crear sesión de conteo
  - Registrar líneas de conteo
  - Detección automática de discrepancias
  - Resolución de diferencias
  - Cierre y auditoría

### 🤖 Automatización
- **[03_automatizacion.md](./03_automatizacion.md)** - Ciclo de Automatización de Alertas y Digests
  - InventoryAutomationRunner (Thread)
  - Lease management (control distribuido)
  - Reconciliación de stock de seguridad (Reconcile Task)
  - Resumen automático periódico (Digest Task)
  - Idempotencia y fault tolerance

### 🏗️ Componentes y Capas
- **[04_arquitectura_backend.md](./04_arquitectura_backend.md)** - Arquitectura del Backend
  - Frontend Layer
  - API REST Layer
  - Business Logic Layer
  - Data Access Layer
  - Automation Layer
  - Database Layer
  - External Services

## 🎯 Cómo Usar Esta Documentación

### Para Desarrolladores
- Referencia rápida sobre cómo fluyen los datos
- Entiende la arquitectura del sistema
- Identifica qué capas toca tu cambio
- Valida que cambios no rompan el flujo

### Para Product Managers
- Visualiza los procesos operativos
- Entiende los tiempos de procesamiento
- Sugiere mejoras basado en el flujo
- Comunica a stakeholders

### Para QA/Testers
- Casos de prueba basados en flujos
- Validación de transacciones
- Puntos críticos a validar
- Escenarios de borde

## 📝 Notas Técnicas

### Rendering
- **VS Code**: Instala extensión "Markdown Preview Mermaid Support" y abre la vista previa Markdown (Ctrl+Shift+V)
- **GitHub**: Se renderizan automáticamente
- **Navegador**: Copia solo el contenido del bloque `mermaid` (sin los ```), y pégalo en https://mermaid.live

### Actualización
- Cuando cambies lógica, actualiza el diagram correspondiente
- Mantén consistencia con el código real
- Commit diagramas cuando hagas cambios arquitectónicos

### Convenciones de Color
- 🔵 **Azul claro**: Acciones del usuario
- 🟣 **Púrpura**: Capas de procesamiento
- 🟢 **Verde**: Flujos exitosos
- 🔴 **Rojo**: Alertas y errores
- 🟡 **Amarillo**: Decisiones/Decisiones
- 🟠 **Naranja**: Datos/BD

---

**Última actualización:** 10 de abril de 2026
