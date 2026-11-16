#!/usr/bin/env bash
# Restore into an isolated database; never modify the running CRM.
set -euo pipefail
backup_dir=$(cd "${1:?Indica la carpeta de copia}" && pwd)
cd "$(dirname "$0")/.."
(cd "$backup_dir" && shasum -a 256 -c SHA256SUMS)
test -s "$backup_dir/database.dump"
tar -tf "$backup_dir/photos.tar" >/dev/null
check_db="crm_restore_check_$(date +%s)_$$"
cleanup(){ docker compose exec -T db dropdb -U crm --if-exists "$check_db" >/dev/null; }
trap cleanup EXIT
docker compose exec -T db createdb -U crm "$check_db"
docker compose exec -T db pg_restore -U crm -d "$check_db" --no-owner --exit-on-error < "$backup_dir/database.dump"
docker compose exec -T db psql -U crm -d "$check_db" -v ON_ERROR_STOP=1 -c "SELECT version FROM crm_state_meta WHERE id=1; SELECT count(*) AS accounts FROM app_users; SELECT count(*) AS works FROM crm_works; SELECT count(*) AS reports FROM crm_labor_reports; SELECT count(*) AS products FROM crm_products;"
has_workspaces=$(docker compose exec -T db psql -U crm -d "$check_db" -At -c "SELECT to_regclass('public.crm_workspaces') IS NOT NULL")
if [ "$has_workspaces" = 't' ]; then
  docker compose exec -T db psql -U crm -d "$check_db" -At -v ON_ERROR_STOP=1 <<'SQL' | python3 scripts/verify-photos.py "$backup_dir/photos.tar"
SELECT format('SELECT DISTINCT %L || ''|'' || (photo->>''src'') FROM (SELECT payload FROM %I.crm_labor_reports UNION ALL SELECT payload FROM %I.crm_site_reports) r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(payload->''photos'',''[]''::jsonb)) photo',id,schema_name,schema_name) FROM public.crm_workspaces WHERE ready
\gexec
SQL
else
  docker compose exec -T db psql -U crm -d "$check_db" -At -v ON_ERROR_STOP=1 -c "SELECT DISTINCT photo->>'src' FROM (SELECT payload FROM crm_labor_reports UNION ALL SELECT payload FROM crm_site_reports) r CROSS JOIN LATERAL jsonb_array_elements(COALESCE(payload->'photos','[]'::jsonb)) photo" | python3 scripts/verify-photos.py "$backup_dir/photos.tar"
fi
printf 'Restauración de prueba correcta; base temporal eliminada al terminar.\n'
