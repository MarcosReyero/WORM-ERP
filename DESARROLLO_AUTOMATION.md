# 🔧 Desarrollo de Automatización - Quick Start

Guía rápida para probar la automatización de stock mínimo en desarrollo local.

## Opciones de Ejecución

### Opción 1: Management Command corto (RECOMENDADO)

**Lo más rápido y fácil:**

```bash
cd backend
python manage.py dev-automation
```

Esto:
- Habilita automáticamente modo desarrollo
- Ejecuta con defaults amigables (polling cada 60s, reconcile cada 10 min)
- Logging visible en consola
- Presiona Ctrl+C para detener

### Opción 2: Management Command completo con flags

```bash
cd backend

# Defaults normales
python manage.py run_inventory_automation --dev

# Testing rápido: polling cada 15s, reconcile cada 30s
python manage.py run_inventory_automation --dev --poll-seconds 15 --reconcile-interval 30

# Con timeout más corto para esperar schema (útil si tienes migraciones no aplicadas)
python manage.py run_inventory_automation --dev --wait-for-schema 60
```

### Opción 3: PowerShell script (si usas Windows)

```powershell
# Desde raíz del proyecto
.\dev-automation.ps1

# Con opciones
.\dev-automation.ps1 -PollSeconds 30 -Verbose

# Ver ayuda
.\dev-automation.ps1 -Help
```

---

## Antes de Empezar

### 1. Asegurate que las migraciones están aplicadas

```bash
cd backend
python manage.py migrate
```

### 2. Ver estado actual en admin

```
http://localhost:8000/admin/inventory/automationtaskstate/
```

Deberías ver 3 filas:
- `scheduler` (idle)
- `minimum_stock_reconcile` (idle)
- `minimum_stock_digest` (idle)

### 3. Confirmar que tienes algunas reglas de alertas

Crea una en admin o vía API si no tienes ninguna.

---

## Qué Verás

Cuando ejecutas el comando en desarrollo:

```
╔════════════════════════════════════════════════════════════╗
║  🚀 MODO DESARROLLO - Automatización de Stock Mínimo      ║
╚════════════════════════════════════════════════════════════╝

Configuración:
  • Poll interval:      60 segundos
  • Reconcile interval: 600 segundos
  • Verbose logging:    ✓ ENABLED

Presiona Ctrl+C para detener.

2026-04-07 10:15:23.456 [inventory.automation.bootstrap] INFO: bootstrap_task_state_complete task_count=3
2026-04-07 10:15:23.789 [inventory.automation.lease] INFO: lease_acquire_attempt task_key=scheduler
2026-04-07 10:15:23.890 [inventory.automation.lease] INFO: lease_acquired task_key=scheduler owner_label=DESKTOP-ABC:12345
2026-04-07 10:15:24.012 [inventory.automation] DEBUG: reconcile_not_due yet, waiting...
2026-04-07 10:15:25.123 [inventory.automation.digest] INFO: digest_due period_key=daily:2026-04-07
2026-04-07 10:15:25.234 [inventory.automation.digest] INFO: digest_period_claimed period_key=daily:2026-04-07
...
```

### Logs importantes:

| Log | Significa |
|-----|-----------|
| `lease_acquired` | El scheduler adquirió el lease, está corriendo |
| `reconcile_start` | Comenzó la reconciliación |
| `reconcile_batch_progress` | Procesó un lote de artículos |
| `reconcile_finish` | Terminó reconciliación (SUCCESS/WARNING/ERROR) |
| `digest_due` | Es hora de enviar digest |
| `digest_claimed` | Consiguió lock del período, va a enviar |
| `digest_send_success` | Email enviado exitosamente |
| `lease_lost` | Perdió el lease (no debería pasar en dev local) |
| `automation_shutdown_signal` | Recibió Ctrl+C, shutting down limpio |

---

## Testing Rápido

### Escenario: Probar reconciliación

```bash
# Terminal 1: Ejecutar automation
cd backend
python manage.py dev-automation --poll-seconds 10 --reconcile-interval 30

# Terminal 2: Cambiar stock de un artículo
cd backend
python manage.py shell
>>> from inventory.models import Article
>>> art = Article.objects.first()
>>> art.current_stock = 5  # Bajo el mínimo
>>> art.save()
>>> # Verá logs en Terminal 1 diciendo que se evaluó

# O via API
curl -X POST http://localhost:8000/api/inventory/movements/
  -H "Content-Type: application/json"
  -d '{"article_id": 1, "quantity": -100, ...}'
```

### Escenario: Probar digest

```bash
# Terminal 1: Automation con timing personalizado
cd backend
python manage.py dev-automation --poll-seconds 10

# Terminal 2: Cambiar hora local para simular próximo envío
# (En test unitario esto es fácil; en dev local requiere cambiar PC time o mock)

# O simplemente dejar corriendo y esperar a la hora configurada (default 08:00)
```

---

## Diferencias: Desarrollo vs Producción

| Aspecto | Desarrollo (`--dev`) | Producción |
|--------|---------------------|-----------|
| **INVENTORY_AUTOMATION_ENABLED** | Ignorado (siempre True) | Debe ser True |
| **Logging** | DEBUG verboso en consola | INFO a logs/file |
| **Schema check** | Timeout corto (10s) | Timeout normal (30s) |
| **Graceful shutdown** | Inmediato (Ctrl+C) | Espera signals (SIGTERM) |
| **Deployment** | Comando directo | Contenedor + docker-compose |
| **Restart policy** | Manual | restart: always |

---

## Troubleshooting

### "ModuleNotFoundError: No module named 'django'"

```bash
# Asegurate de activar venv
source .venv/bin/activate  # Linux/Mac
.\.venv\Scripts\Activate.ps1  # Windows PowerShell
```

### "Schema not ready"

```bash
# Aplica migraciones
python manage.py migrate
```

### "No module named 'inventory.management.commands.dev_automation'"

```bash
# Django no ve el nuevo comando aún; reinicia el shell/proceso
# O simplemente usa el command base:
python manage.py run_inventory_automation --dev
```

### "TypeError: _check_automation_enabled() takes 1 positional argument but 2 were given"

Probablemente tienes un venv desactualizado. Reinstala/recarga:

```bash
python manage.py shell
>>> import importlib
>>> import inventory.management.commands.run_inventory_automation
>>> importlib.reload(inventory.management.commands.run_inventory_automation)
```

---

## Admin: Monitorear en Tiempo Real

Mientras corre la automation, puedes ver el estado en:

```
http://localhost:8000/admin/inventory/automationtaskstate/
```

Recarga cada pocos segundos para ver:
- `scheduler`: heartbeat_at actualizado cada poll
- `minimum_stock_reconcile`: last_run_status, last_processed_count actualizado
- `minimum_stock_digest`: last_delivery_status, last_notified_at

---

## Detener Limpio

Presiona **Ctrl+C** en la terminal. Deberías ver:

```
Interrupción por usuario (Ctrl+C)
✓ Scheduler finalizado.
```

Si algo falla, logs van a:
- Console (durante lectura)
- `django.log` o similar (si hay handlers configurados)

---

## Next Steps

Una vez que lo pruebes localmente y veas que funciona:

1. Ejecutar tests: `python manage.py test inventory.tests_automation_suite`
2. Probar con docker-compose en local machine
3. Revisar logs en admin
4. Deploy a producción con contenedores

---

¡Happy testing! 🎉
