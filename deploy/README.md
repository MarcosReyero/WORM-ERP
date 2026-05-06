# Archivos de despliegue

Archivos de infraestructura (Docker/nginx) para **Worm ERP**.

## Guías

- LAN + HTTPS + PWA (sin barra del navegador): `deploy/GUIA_LAN_HTTPS_PWA.md`

## Producción (recomendado)

Desde la raíz del repo:

```bash
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml up -d --build
```

## LAN (mkcert)

Para LAN con certificado propio:

- Usar `deploy/Caddyfile.lan`
- Ver pasos completos en `deploy/GUIA_LAN_HTTPS_PWA.md`

## Nota

- `deploy/docker-compose.legacy.yml` y `deploy/Dockerfile.legacy` se conservan solo como referencia histórica.
