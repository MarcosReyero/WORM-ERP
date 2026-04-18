# Nodum ERP

Base inicial de un ERP modular con:

- `Python`
- `Django`
- `React`
- `SQLite`

Incluye:

- Login con Django Auth
- Navbar superior
- Dashboard tipo launcher inspirado en la referencia
- Modulo de inventario interno para planta
- Alta rapida de articulos
- Movimientos de stock por cantidad y por unidad
- Prestamos y devoluciones de herramientas
- Conteos fisicos y diferencias de inventario
- Trazabilidad automatica en movimientos y acciones sensibles
- Datos demo migrados para entrar y probar el panel

## Estructura

- `backend/`: API Django + SQLite
- `frontend/`: app React con Vite

## Usuario demo

- Usuario: `admin`
- Clave: `admin1234`

## Arranque en desarrollo

### Backend

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py runserver
```

### Frontend

```powershell
cd frontend
npm run dev
```

## 🔧 Automatización de Stock Mínimo - Desarrollo

### Comenzar Quick (Recomendado)

```powershell
cd backend
python manage.py dev-automation
```

**Esto ejecuta:**
- Scheduler de automatización en modo desarrollo
- Polling cada 60s
- Reconciliación cada 10 min
- Logging DEBUG en consola
- Presiona Ctrl+C para parar

### Opciones de Ejecución

**1. Management command corto (más fácil):**
```bash
python manage.py dev-automation
```

**2. Management command completo con flags:**
```bash
# Defaults
python manage.py run_inventory_automation --dev

# Testing rápido: polling cada 15s, reconcile cada 30s
python manage.py run_inventory_automation --dev --poll-seconds 15 --reconcile-interval 30

# Polling personalizado
python manage.py run_inventory_automation --dev --poll-seconds 30 --reconcile-interval 300
```

**3. PowerShell script (Windows):**
```powershell
# Desde raíz del proyecto
.\dev-automation.ps1
.\dev-automation.ps1 -PollSeconds 30 -Verbose
.\dev-automation.ps1 -Help  # Ver todas las opciones
```

### Monitorear en Admin

Mientras corre la automatización, observa el estado en tiempo real:
```
http://localhost:8000/admin/inventory/automationtaskstate/
```

Verás:
- `scheduler`: heartbeat actualizado cada poll
- `minimum_stock_reconcile`: último estado, cantidad procesada
- `minimum_stock_digest`: estado de envíos periódicos

### Logs que Verás

- `lease_acquired` = Scheduler funciona
- `reconcile_start` = Comenzó reconciliación
- `reconcile_batch_progress` = Procesó lote de artículos
- `digest_due` = Es hora de enviar resumen  
- `digest_send_success` = Email enviado
- Ctrl+C = `automation_shutdown_signal` + limpieza

### Testing Rápido de Cambios

```bash
# Terminal 1
python manage.py dev-automation --poll-seconds 10

# Terminal 2: Cambiar stock de artículo y ver logs
python manage.py shell
>>> from inventory.models import Article
>>> art = Article.objects.first()
>>> art.minimum_stock = 100
>>> art.save()
# Observa Terminal 1 → reconcile ejecutándose
```

### Más Detalle

Ver documentación completa en: **[DESARROLLO_AUTOMATION.md](DESARROLLO_AUTOMATION.md)**

---

- `backend/manage.py migrate`
- `backend/manage.py check`
- `backend/manage.py test`
- `frontend/npm run lint`
- `frontend/npm run build`
