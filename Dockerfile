"""
Dockerfile multi-stage para containerizar la aplicación.

Stages:
- base: Dependencias comunes (Python, packages)
- web: Django + Gunicorn para requests HTTP
- worker: Python entrypoint para management command (automation runner)
"""

FROM python:3.11-slim as base

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements y instalar paquetes Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código de la aplicación
COPY . .

# ==========================================
# STAGE: WEB (Django + Gunicorn)
# ==========================================
FROM base as web

# Crear usuario no-root para seguridad
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Exponer puerto
EXPOSE 8000

# Entrypoint: Gunicorn
ENTRYPOINT ["gunicorn"]
CMD ["config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4"]

# ==========================================
# STAGE: WORKER (Automation Runner)
# ==========================================
FROM base as worker

# Crear usuario no-root
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# No exponer puerto (no es HTTP)

# Entrypoint: Django management command
ENTRYPOINT ["python", "manage.py"]
CMD ["run_inventory_automation"]
