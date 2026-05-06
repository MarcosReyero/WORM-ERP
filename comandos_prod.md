# Comandos rápidos de deploy (prod)

Guía completa (LAN + HTTPS + PWA): `deploy/GUIA_LAN_HTTPS_PWA.md`

## 1) En tu PC (commit + push)

```bash
cd C:\Users\Admin\Workspace\inventary\Inventary
git pull
git status

# editás...

cd frontend
npm ci
npm run build
cd ..

git add -A
git commit -m "frontend: update"
git push
```

## 2) En el server (pull + build + restart)

> Requiere Node 20.19+ para `npm run build`.

```bash
cd /opt/WORM-ERP
git pull

cd frontend
npm ci
npm run build
cd ..

docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml up -d
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml restart nginx
```

## 3) Si además hubo cambios de backend

```bash
cd /opt/WORM-ERP
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml up -d --build
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml exec -T web python manage.py migrate
```

