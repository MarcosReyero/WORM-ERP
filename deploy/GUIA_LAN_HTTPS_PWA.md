# Guía LAN + HTTPS + PWA (sin barra del navegador)

Esta guía documenta el despliegue de **WORM ERP** en **red local (LAN)** con:

- Acceso por dominio interno (ej: `worm.lan`)
- HTTPS con certificado propio (mkcert)
- Instalación como **PWA** en Android/iOS (modo *standalone* sin UI del navegador)

> Objetivo práctico: que en celular la app use cámara sin bloqueos y, al instalarla, se vea como app nativa (sin barra de URL).

---

## 1) DNS en LAN (worm.lan → IP del server)

### Opción recomendada: AdGuard Home como DNS local

En el server (ej: `192.168.8.6`) podés correr AdGuard Home y hacer un **DNS rewrite**:

- `worm.lan` → `192.168.8.6`

Luego configurás tu router/DHCP para que los clientes usen ese DNS.

Si al levantar AdGuard falla el puerto `53` (“address already in use”), en Ubuntu suele ser `systemd-resolved`:

- Desactivar el stub listener y reiniciar:
  - Crear `/etc/systemd/resolved.conf.d/00-disable-stub.conf` con:
    - `[Resolve]`
    - `DNSStubListener=no`
  - `sudo systemctl restart systemd-resolved`
  - `sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf`

Notas:
- Si tu router no permite custom DNS por DHCP, podés usar AdGuard como DHCP, pero es preferible que el router siga siendo DHCP.
- Si un dispositivo resuelve en el celu pero no en PC: revisá el DNS que usa ese cliente y limpiá caché DNS.

---

## 2) HTTPS en LAN con mkcert (certificado confiable)

En LAN **no** podés usar Let's Encrypt con `worm.lan` (dominio no público). En su lugar:

1) En tu PC (Windows) instalás mkcert y generás el cert del dominio:
   - `mkcert -install`
   - `mkcert worm.lan`
   - Te genera: `worm.lan.pem` y `worm.lan-key.pem`

2) Copiás esos archivos al server y los montás en Caddy:

- En el server, guardalos (ejemplo):
  - `deploy/certs/cert.pem`
  - `deploy/certs/key.pem`

> No commitear certificados/keys. `deploy/certs/` estÃ¡ pensado para uso local y las extensiones estÃ¡n ignoradas por `.gitignore`.

3) Configurás Caddy para usar el cert local (LAN):

- Usar `deploy/Caddyfile.lan` (en vez de `deploy/Caddyfile`).
- En `deploy/docker-compose.prod.yml`:
  - Montar `./Caddyfile.lan` como `/etc/caddy/Caddyfile`
  - Montar `./certs` como `/etc/caddy/certs` (read-only)

4) **Importante**: para que el candado NO aparezca tachado, **cada celular/PC** debe confiar el **root CA** de mkcert.

### Instalar el CA de mkcert en Android (se hace 1 vez por dispositivo)

1) En la PC, ubicá el root CA:
   - `mkcert -CAROOT`
   - Archivo: `rootCA.pem`

2) Pasalo al teléfono y renombralo (recomendado):
   - `rootCA.pem` → `WORM-CA.crt`

3) Android:
   - Ajustes → Seguridad/Privacidad → **Cifrado y credenciales** → **Instalar un certificado** → **Certificado CA**
   - Seleccioná `WORM-CA.crt`

4) Verificá:
   - Abrí `https://worm.lan` en Chrome → el certificado debe quedar **sin tachado**

> Sí: hay que instalarlo en cada teléfono (a menos que uses MDM o pases a un dominio público con CA pública).

---

## 3) PWA: instalar sin barra del navegador

### Requisitos
- HTTPS “confiable” (sin tachado).
- `manifest.webmanifest` con `display: "standalone"`.

Nota de deploy:
- `deploy/nginx.conf` fuerza `no-cache` para `manifest.webmanifest` y `sw.js` para evitar quedarse pegado a versiones viejas.

### Android (Chrome)
- Abrí `https://worm.lan`
- Menú ⋮ → **Instalar app**
- Abrí desde el ícono instalado (no desde el navegador)

Si desde el ícono ves barra igual:
- Seguramente es un “atajo viejo” o el origen no está seguro (candado tachado).
- Borrá el ícono, borrá datos del sitio `worm.lan` en Chrome, y reinstalá.

### iOS (Safari)
- Abrí `https://worm.lan`
- Compartir → **Añadir a inicio**

---

## 4) Deploy (Docker)

Los archivos de infraestructura viven en `deploy/`.

Arranque:

```bash
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml up -d --build
```

Comandos útiles:

```bash
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml ps
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml logs --tail=200 web
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml restart nginx
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml exec -T web python manage.py migrate
```

Variables críticas en `.env`:
- `DATABASE_URL`
- `SECRET_KEY`
- `ALLOWED_HOSTS` (incluí `worm.lan` y la IP del server)
- `CSRF_TRUSTED_ORIGINS` (incluí `https://worm.lan`)

Troubleshooting rápido:
- Si `/api/auth/csrf/` devuelve **400** en HTTPS:
  - Revisar `ALLOWED_HOSTS` y `CSRF_TRUSTED_ORIGINS` en `.env`.
  - Asegurarse de correr compose con `--env-file .env` (si no, toma defaults del compose).
  - Verificar variables dentro del container:

```bash
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml exec -T web \
  python -c "import os; print(os.getenv('ALLOWED_HOSTS')); print(os.getenv('CSRF_TRUSTED_ORIGINS'))"
```

---

## 5) Frontend build en server (Node)

El frontend usa Vite moderno: **Node 20.19+**.

En el server:

```bash
cd /opt/WORM-ERP/frontend
npm ci
npm run build
cd ..
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml restart nginx
```

Si “no cambia” en un dispositivo: probablemente es caché / Service Worker.
- En Chrome/Android: borrar datos del sitio `worm.lan` y recargar.
