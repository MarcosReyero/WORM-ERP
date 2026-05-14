#!/bin/sh
set -e

if [ "${RUN_SETUP:-false}" = "true" ]; then
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput
fi

exec "$@"
