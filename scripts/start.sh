#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  umask 077
  printf 'POSTGRES_PASSWORD=%s\nBIND_ADDRESS=127.0.0.1\nAPP_PORT=8180\nADMIN_PORT=8182\nCRM_PUBLIC_URL=http://localhost:8180\n' "$(openssl rand -hex 32)" > .env
fi
for key in AUTH_ENCRYPTION_KEY CRM_GATEWAY_TOKEN CRM_DEPLOYMENT_ID; do
  if ! grep -q "^${key}=" .env; then
    printf '%s=%s\n' "$key" "$(openssl rand -hex 32)" >> .env
  fi
done
if ! grep -q '^CRM_RUNTIME_PASSWORD=' .env; then
  printf 'CRM_RUNTIME_PASSWORD=%s\n' "$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env
docker compose config --quiet
docker compose up -d --wait db
python3 scripts/provision-runtime.py
docker compose up -d --build
ready=0
for attempt in $(seq 1 60); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/auth').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"; then
    ready=1; break
  fi
  sleep 2
done
if [ "$ready" != 1 ]; then echo 'La aplicación no está lista. Revisa docker compose logs app.' >&2; exit 1; fi
count=$(docker compose exec -T db psql -U crm -d crm -tAc 'SELECT count(*) FROM app_users')
if [ "$count" = 0 ]; then
  docker compose exec -T app node scripts/bootstrap-admin.mjs
else
  printf 'Conservadas las cuentas existentes.\n'
fi
printf '\nNexo CRM: http://localhost:8180 — solo datos ficticios.\n'
