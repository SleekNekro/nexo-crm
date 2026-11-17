#!/usr/bin/env bash
# Disposable integration environment. Refuse existing fixtures; never reset production.
set -euo pipefail
cd "$(dirname "$0")/.."
compose=(docker compose --env-file "${CRM_ENV_FILE:-.env}")
if [ -n "${CRM_PROJECT:-}" ]; then compose+=(-p "$CRM_PROJECT"); fi
app_check=nexo-auth-check
pdf_check=nexo-security-pdf-check
photo_volume=nexo_security_test_photos
pdf_volume=nexo_security_test_pdf
for name in "$app_check" "$pdf_check"; do
  if docker inspect "$name" >/dev/null 2>&1; then
    printf 'Existe el contenedor de prueba %s; no se modificará.\n' "$name" >&2; exit 1
  fi
done
"${compose[@]}" config --quiet
# createdb fails if the test database already exists: do not overwrite another run.
"${compose[@]}" exec -T db createdb -U crm -O crm_owner crm_auth_check
cleanup() {
  docker rm -f "$app_check" "$pdf_check" >/dev/null 2>&1 || true
  "${compose[@]}" exec -T db dropdb -U crm --force crm_auth_check >/dev/null
  docker volume rm "$photo_volume" "$pdf_volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
"${compose[@]}" exec -T db psql -U crm -d crm_auth_check -v ON_ERROR_STOP=1 -c 'ALTER SCHEMA public OWNER TO crm_owner' >/dev/null
# Capture the configured runtime credential without printing it or placing it in argv.
DATABASE_URL=$("${compose[@]}" exec -T app node -e 'const u=new URL(process.env.DATABASE_URL);if(u.pathname!=="/crm")process.exit(1);u.pathname="/crm_auth_check";console.log(u.href)')
export DATABASE_URL
"${compose[@]}" run -d --no-deps --name "$pdf_check" -v "$pdf_volume:/run/crm-pdf" pdf >/dev/null
"${compose[@]}" run -d --no-deps --name "$app_check" -p 127.0.0.1:8081:3000 -e DATABASE_URL -e COOKIE_SECURE=false -e CRM_GATEWAY_URL= -e CRM_GATEWAY_TOKEN= -e CRM_DEPLOYMENT_ID= -v "$photo_volume:/app/storage" -v "$pdf_volume:/run/crm-pdf" app >/dev/null
ready=0
for attempt in $(seq 1 30); do
  if curl -fsS http://localhost:8081/api/auth >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" != 1 ]; then printf 'El entorno ficticio no ha arrancado.\n' >&2; exit 1; fi
node --experimental-strip-types tests/auth.integration.mjs
node --experimental-strip-types tests/workspaces.integration.mjs
node --experimental-strip-types tests/security-regression.integration.mjs
