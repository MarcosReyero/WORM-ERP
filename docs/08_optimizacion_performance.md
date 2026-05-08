# Guía de optimización (performance + recursos)

Objetivo: mejorar velocidad percibida en cliente (PC/móvil) y bajar consumo de CPU/RAM/red en server cuando usan varios usuarios a la vez.

## Cambios aplicados en este repo

### 1) Code-splitting por ruta (frontend)
Archivo: `frontend/src/App.jsx`

- Antes: `App.jsx` importaba todas las páginas de forma eager (quedaban en bundle inicial).
- Ahora: páginas cargan con `React.lazy()` + `Suspense` al entrar a cada ruta.

Impacto:
- Menos JS inicial ⇒ menos tiempo de descarga/parse/ejecución.
- Menos uso de RAM/CPU en dispositivos lentos (móviles).

Trade-off:
- Primer acceso a una ruta nueva puede mostrar pantalla "Cargando" durante 1-2s (según red/CPU).

### 2) Polling más liviano y respetando visibilidad (frontend)
Archivo: `frontend/src/App.jsx`

Antes:
- Cada 15s se llamaba `fetchSession()` y `fetchDashboard()` siempre, incluso si pestaña estaba en background.

Ahora:
- Poll secuencial con `setTimeout` (evita requests solapados si red lenta).
- Solo poll si `document.visibilityState === 'visible'`.
- `fetchSession()` cada ~30s (por defecto).
- `fetchDashboard()` cada ~60s (por defecto).
- Refresh inmediato al volver a foco (evento `visibilitychange`).

Configurable:
- `VITE_POLL_SESSION_MS` (mínimo 5000 ms).
- `VITE_POLL_DASHBOARD_MS` (mínimo igual a `VITE_POLL_SESSION_MS`).

Impacto:
- Menos carga en backend (menos requests por usuario).
- Menos consumo de batería/red en móviles.
- Menos picos en server cuando hay muchos usuarios conectados.

Trade-off:
- Conteos (alarmas/mensajes) pueden tardar hasta 30-60s en reflejarse si nadie refresca manualmente.

### 3) Service Worker: evitar cachear contenido pesado o sensible
Archivo: `frontend/public/sw.js`

Se evitó cachear:
- `/media/` (puede incluir imágenes/archivos pesados subidos por usuarios).
- `/admin/` (no aporta al PWA y evita cache de HTML administrativo).

Impacto:
- Menos uso de storage en teléfono.
- Menos riesgos de "cache bloat" y problemas de espacio.

### 4) Cache de assets fingerprinted (nginx)
Archivo: `deploy/nginx.conf`

Se agregó:
- `location /assets/` con `Cache-Control: public, max-age=31536000, immutable`.

Impacto:
- Navegadores cachean JS/CSS/woff2 por largo tiempo (son archivos con hash, seguros de cachear).
- Menos ancho de banda y tiempos de carga en visitas repetidas.

## Checklist de monitoreo (recomendado)

### Cliente
- Chrome DevTools:
  - Network: revisar que `/assets/*` quede desde cache (memory/disk) en segunda carga.
  - Performance: revisar "scripting time" en primer render.
- Lighthouse (mobile):
  - LCP/CLS/INP. Comparar antes/después.

### Server
- Ver carga y RAM:
  - `top` / `htop`
  - `docker stats`
- Ver DB:
  - conexiones activas y locks (Postgres).
- Revisar logs:
  - `docker compose logs -f web nginx caddy`

## Ajustes recomendados (no aplicados todavía)

### Gunicorn (web)
- Ajustar workers/threads según CPU y carga:
  - Regla rápida: `workers = (2 * CPU) + 1` (si endpoints son CPU-bound, bajar; si IO-bound, considerar threads).
- Agregar:
  - `--max-requests` y `--max-requests-jitter` para controlar leaks (si aparecen).

### Postgres
- Si hay muchos usuarios:
  - evaluar pool (PgBouncer) y tuning básico (`shared_buffers`, `work_mem`, `max_connections`).

### Django
- Caching real (Redis) para endpoints de overview/dashboard si se vuelven caros.
- Revisar N+1: usar `select_related`/`prefetch_related` en endpoints con listas grandes.

## Dudas / cuestionamiento (qué podría salir mal)

- Lazy routes:
  - Si un módulo se usa siempre (ej: inventario), el beneficio de code splitting se nota más en login/primer render, menos en uso diario.
- Polling más lento:
  - Puede generar "me parece que no actualiza" si esperan refresh cada 15s. Se puede ajustar por env.
- Cache immutable:
  - Funciona solo si assets están fingerprinted (Vite lo hace). Si en algún momento se sirve un asset sin hash desde `/assets/`, podría quedar cacheado de más.

