#!/bin/sh
set -e

git pull
docker compose -p worm_erp --env-file .env -f deploy/docker-compose.prod.yml up -d --build --force-recreate
