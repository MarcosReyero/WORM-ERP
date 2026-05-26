# WORM ERP — Flujo general del sistema

---

## 1. AUTENTICACIÓN

```
[Pantalla de Login]
  │
  ├── Ingresa credenciales (usuario + contraseña)
  │
  ├── [Backend: fetchCsrfCookie → POST /api/auth/login/]
  │
  ├── ¿Credenciales válidas?
  │     ├── NO → Muestra error, vuelve a Login
  │     └── SÍ → Carga sesión del usuario
  │
  └── [POST /api/auth/session/] → Devuelve user + rol + permisos
        │
        └── Carga dashboard → [GET /api/dashboard/] → Acceso a módulos
```

---

## 2. USUARIOS, ROLES Y PERMISOS

```
[Sistema de identidad]
  │
  ├── Usuario (Django auth.User)
  │     └── UserProfile
  │           ├── Rol: ADMINISTRATOR | STOREKEEPER | SUPERVISOR |
  │           │         OPERATOR | MAINTENANCE | PURCHASING | AUDITOR
  │           ├── Estado: ACTIVO | INACTIVO
  │           ├── Sector por defecto (FK → Sector)
  │           ├── Telegram Chat ID (para alertas)
  │           └── Tema preferido (claro / oscuro)
  │
  ├── Permisos por Rol (RolePermission)
  │     └── (Rol, Módulo) → Acciones: ver | crear | editar | eliminar | exportar | aprobar
  │
  ├── Permisos por Usuario (UserModulePermission)
  │     └── Overrides individuales que se combinan con el rol
  │
  └── Permisos por Sector (SectorPermission)
        └── (Usuario, Sector) → puede ver / editar / eliminar en ese sector

[Módulos protegidos por permiso]
  ├── inventory_overview    → Resumen de inventario
  ├── stock_management      → Stock de artículos
  ├── movements             → Movimientos de stock
  ├── checkouts             → Préstamos de herramientas
  ├── alarms                → Alarmas de inventario
  ├── counts                → Conteos físicos
  ├── discrepancies         → Diferencias de inventario
  ├── purchasing            → Solicitudes de compra
  ├── deposits_overview     → Resumen de depósitos
  ├── pallet_registry       → Registro de pallets
  ├── deposit_layout        → Layout de depósito
  ├── pallet_scans          → Escaneo de pallets
  ├── personal              → Informes de personal
  ├── tia                   → Integración PLC/TIA
  ├── admin_users           → Administración de usuarios
  └── reports               → Reportes generales
```

---

## 3. HUB DE MÓDULOS

```
[ModuleHub — pantalla principal]
  │
  ├── Visibles según permisos del usuario
  │
  ├── → Inventario      (/inventario)
  ├── → Depósitos       (/depositos)
  ├── → Compras         (/compras)
  ├── → Personal        (/personal)
  ├── → TIA             (/tia)
  ├── → Mensajes        (/mensajes)
  ├── → Perfil          (/perfil)
  └── → Administración  (/administracion)  [solo ADMINISTRATOR]
```

---

## 4. MÓDULO INVENTARIO

```
[InventoryLayout]
  │
  ├── [Resumen]  /inventario/resumen
  │     └── Totales: artículos activos, stock bajo mínimo, préstamos abiertos,
  │           conteos en curso, últimos movimientos
  │
  ├── [Stock]  /inventario/stock
  │     ├── Lista de artículos con stock actual, mínimo, ubicación, categoría
  │     ├── Filtros: sector, categoría, tipo, estado stock
  │     ├── Exportar a Excel
  │     └── → Detalle de artículo  /inventario/stock/:articleId
  │               ├── Info del artículo (código, tipo, unidad, sector, ubicación)
  │               ├── Saldos por ubicación y lote
  │               ├── Historial de movimientos del artículo
  │               ├── Préstamos activos (si aplica)
  │               └── Alertas activas (stock bajo mínimo / seguridad)
  │
  ├── [Movimientos]  /inventario/movimientos
  │     ├── Listado de todos los movimientos con filtros
  │     ├── Tipos:
  │     │     Ingresos: por compra | por devolución | por ajuste
  │     │     Egresos:  por consumo | producción | préstamo | rotura | vencimiento | baja
  │     │     Otros:    transferencia | ajuste por conteo
  │     └── Cada movimiento registra: artículo, cantidad, ubicación origen/destino,
  │               persona/sector, lote, motivo, usuario que registra
  │
  ├── [Préstamos]  /inventario/prestamos
  │     ├── Aplica a artículos con tracking por UNIDAD (TrackedUnit)
  │     ├── Tipos: Préstamo (temporal) | Asignación (fija)
  │     ├── Receptor: Persona o Sector
  │     ├── Estados: ABIERTO → DEVUELTO | VENCIDO | CANCELADO
  │     └── Al devolver: registra condición de entrada y genera movimiento RETURN_IN
  │
  ├── [Conteos]  /inventario/conteos
  │     ├── Crear sesión: tipo (General | Parcial | Por sector | Por familia | Cíclico)
  │     ├── Agregar líneas: artículo + ubicación + cantidad del sistema vs contada
  │     ├── Estados sesión: ABIERTO → EN REVISIÓN → CERRADO
  │     ├── Cada línea: PENDIENTE → REVISADO → APROBADO
  │     └── Al aprobar líneas con diferencia → genera StockDiscrepancy automáticamente
  │
  ├── [Diferencias]  /inventario/diferencias
  │     ├── Lista diferencias detectadas en conteos
  │     ├── Estado: ABIERTA → RESUELTA | IGNORADA
  │     └── Al resolver: crea movimiento COUNT_ADJUST para corregir el stock
  │
  └── [Alarmas]  /inventario/alarmas
        ├── Alertas de stock de seguridad (por artículo)
        │     ├── Configuración: artículo, habilitada, destinatarios, email/telegram
        │     ├── Estado: MONITOREANDO | DISPARADA
        │     ├── Acción: envía email + mensaje interno cuando stock baja del mínimo de seguridad
        │     └── Botón "Enviar ahora" (reporte manual)
        │
        ├── Resumen periódico de stock mínimo (digest global)
        │     ├── Frecuencia: diaria o semanal, hora configurada
        │     ├── Destinatarios múltiples (usuarios + emails externos)
        │     ├── Envío: email con adjunto Excel listando artículos bajo mínimo
        │     └── Botón "Enviar ahora" (envío manual inmediato)
        │
        └── Reporte completo de stock (full report)
              ├── Frecuencia configurable (diaria/semanal)
              ├── Envío: email con adjunto Excel con todo el stock
              └── Botón "Enviar ahora"
```

---

## 5. MÓDULO DEPÓSITOS

```
[DepositsLayout]
  │
  ├── [Resumen]  /depositos/resumen
  │     └── Registry de pallets: listado con artículo, lote, cantidad, posición, estado
  │
  └── [Registro / Escaneo]  /depositos/registro
        ├── Escanear QR de pallet (cámara o manual)
        ├── Resultado del escaneo: artículo, lote, cantidad, ubicación actual
        ├── Opciones: registrar pallet nuevo | reubicar pallet existente
        └── Genera PalletEvent: REGISTRADO | REUBICADO | ESCANEO_CONSULTA

[Estructura de depósito]
  Location (almacén / taller / producción / calidad / cuarentena)
    └── StorageZone (zona A, B, C...)
          └── StoragePosition (posición individual con coordenadas x/y)
                └── Pallet (artículo + lote + cantidad + estado)
```

---

## 6. MÓDULO COMPRAS

```
[PurchasingLayout]
  │
  ├── [Solicitudes]  /compras/solicitudes
  │     ├── Listado de solicitudes internas de compra
  │     ├── Filtros: número, solicitante, sector, estado
  │     ├── Crear solicitud manualmente:
  │     │     └── Solicitante (Persona) + Sector + Líneas (artículo + cantidad)
  │     ├── Número automático: REQ-AAAAMMDD-{id:06d}
  │     ├── Flujo de estados:
  │     │     BORRADOR → PENDIENTE → APROBADA → ENTREGA PARCIAL → CERRADA
  │     │                          → RECHAZADA
  │     └── Al aprobar: registra responsable de entrega y cantidad entregada por línea
  │
  ├── [Alarmas]  /compras/alarmas
  │     └── Configuración del canal de notificación para alarmas de stock mínimo
  │           (destinatarios, email/telegram)
  │
  └── [Automatización]  /compras/automatizacion
        ├── Lista artículos activos que tienen stock mínimo configurado
        ├── Filtro por categoría
        ├── Checkbox por artículo: activar/desactivar monitoreo automático
        ├── Info bar: cuántos monitoreados, cuántos ya en stock bajo
        ├── Al guardar: persiste flag auto_purchase_request en el artículo
        └── Job automático (cada 10 min):
              ├── Busca artículos con auto_purchase_request = true
              ├── Para cada uno: verifica stock actual vs mínimo
              ├── Si stock ≤ mínimo y no hay solicitud abierta para ese artículo:
              │     └── Crea InternalRequest automáticamente (estado PENDIENTE)
              │           con notas indicando motivo y valores de stock
              └── La solicitud aparece en /compras/solicitudes lista para aprobar

[Conexión Inventario → Compras]
  Artículo con stock bajo mínimo
    ├── (automático) auto_purchase_request=true → Job → solicitud creada
    └── (alarma) MinimumStockAlarmState TRIGGERED → email/telegram → revisión manual
```

---

## 7. MÓDULO PERSONAL

```
[PersonalLayout]
  │
  └── [Informes]  /personal/informes
        ├── Registro diario de actividades del usuario logueado
        ├── Un informe por usuario por día (unicidad controlada)
        ├── Campos: fecha, etiqueta del día, descripción de actividades (texto libre)
        ├── Crear / editar / eliminar informes propios
        ├── Exportar a Excel (filtrado por rango de fechas)
        └── Importar desde Excel (bulk)
```

---

## 8. MÓDULO TIA (Integración PLC)

```
[TiaLayout]
  │
  ├── [Enlace S7]  /tia/enlace-s7
  │     ├── Dashboard de variables PLC en tiempo real
  │     ├── Conexión via MCP Server → Siemens S7 (TCP/IP, rack/slot configurables)
  │     ├── Variables por defecto: marcha_motor, fallo_motor, contador_piezas, temperatura
  │     ├── Puede leer cualquier tag del PLC definido en tag_map
  │     └── Estado de conexión: activo | error | sin configuración
  │
  └── [Análisis IA]  /tia/analisis-ia
        ├── Reportes generados por IA sobre los datos del PLC
        └── Análisis de patrones, anomalías y sugerencias
```

---

## 9. MÓDULO MENSAJES

```
[MessagesPage]  /mensajes
  │
  ├── Dos tipos de conversaciones:
  │     ├── DIRECTA: iniciada por un usuario hacia otro
  │     └── ALARMA: creada automáticamente por el sistema (alarma de inventario)
  │
  ├── Flujo de mensaje directo:
  │     ├── Seleccionar destinatario → crear conversación → enviar mensaje
  │     └── Adjuntos soportados (archivos)
  │
  ├── Flujo de alarma:
  │     ├── Evento en inventario (stock bajo, discrepancia, etc.)
  │     ├── Sistema crea InventoryAlarm + Conversation tipo ALARM
  │     ├── Estados: ABIERTA → LEÍDA → CERRADA
  │     └── Usuario puede cerrar la alarma desde la conversación
  │
  └── Contador de no leídos visible en el shell de navegación
```

---

## 10. ADMINISTRACIÓN

```
[AdminLayout]  /administracion  [solo ADMINISTRATOR]
  │
  ├── [Usuarios]  /administracion/usuarios
  │     ├── Listado de todos los usuarios del sistema
  │     ├── Crear usuario: nombre, email, contraseña temporal, rol, sector, estado
  │     ├── Editar: datos de perfil, rol, estado (activar/desactivar)
  │     └── Resetear contraseña
  │
  ├── [Permisos]  /administracion/permisos
  │     ├── Vista por rol: qué acciones tiene cada rol en cada módulo
  │     ├── Vista por usuario: overrides individuales
  │     └── Configurar permisos de sector por usuario
  │
  └── [Guía de Roles]  /administracion/guia-roles
        └── Descripción de cada rol y sus accesos por defecto
```

---

## 11. PERFIL

```
[ProfileLayout]  /perfil
  │
  └── [Detalles]  /perfil
        ├── Ver y editar datos propios: nombre, teléfono, avatar
        ├── Cambiar contraseña
        ├── Configurar Telegram Chat ID (para recibir alertas)
        └── Cambiar tema (claro / oscuro) → persiste en backend
```

---

## 12. AUTOMATIZACIÓN DE FONDO (jobs internos)

```
[Scheduler — hilo de fondo en el proceso web]
  │
  ├── Cada 10 minutos: Job de Reconciliación
  │     ├── Evalúa alertas de stock de seguridad (SafetyStockAlertRule)
  │     │     └── Si stock ≤ seguridad → envía email + mensaje interno
  │     ├── Evalúa alarmas de stock mínimo (MinimumStockAlarmState)
  │     │     └── Si stock ≤ mínimo → cambia estado a TRIGGERED
  │     └── Ejecuta auto-solicitudes de compra (run_auto_purchase_requests)
  │           └── Si artículo monitoreado con stock ≤ mínimo → crea InternalRequest
  │
  ├── Periódicamente: Digest de stock mínimo
  │     ├── Evalúa si corresponde enviar según frecuencia/hora configurada
  │     └── Envía email con Excel adjunto a destinatarios configurados
  │
  └── Periódicamente: Reporte completo de stock
        ├── Evalúa si corresponde según frecuencia configurada
        └── Envía email con Excel adjunto con todo el inventario
```

---

## 13. FLUJO DE DATOS TRANSVERSAL

```
Artículo
  ├── tiene stock actual (suma de InventoryBalance por ubicación)
  ├── tiene stock mínimo configurado → dispara alarmas + solicitudes automáticas
  ├── tiene modo de tracking: CANTIDAD (balances) o UNIDAD (TrackedUnit individual)
  ├── pertenece a una categoría + subcategoría
  ├── tiene sector responsable → determina quién recibe alertas y hace solicitudes
  └── puede estar en un pallet (depósitos) o en posición libre (stock)

Persona (Person)
  ├── trabaja en un Sector
  ├── puede recibir préstamos de herramientas (TrackedUnit → AssetCheckout)
  └── puede ser solicitante o responsable de entrega en InternalRequest

Sector
  ├── agrupa personas y ubicaciones
  ├── es el solicitante en InternalRequest automáticas
  └── define permisos de acceso por usuario (SectorPermission)
```
