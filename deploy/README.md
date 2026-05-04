# Archivos de despliegue

Archivos de infraestructura (Docker/nginx) para **Worm ERP**.

## Producción (recomendado)

Desde la raíz del repo:

```bash
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml up -d --build
```

## Nota

- `deploy/docker-compose.legacy.yml` y `deploy/Dockerfile.legacy` se conservan solo como referencia histórica.

