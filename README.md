# Inventary ERP

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

## Verificaciones ejecutadas

- `backend/manage.py migrate`
- `backend/manage.py check`
- `backend/manage.py test`
- `frontend/npm run lint`
- `frontend/npm run build`
