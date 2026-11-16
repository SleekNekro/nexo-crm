#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
backup_dir="backups/server-$(date +%Y%m%d-%H%M%S)"
mkdir "$backup_dir"
app_running=$(docker compose ps --status running --services app)
resume(){ if [ -n "$app_running" ]; then docker compose start app >/dev/null; fi; }
trap resume EXIT
# Stop writes so database and photos belong to the same snapshot.
docker compose stop app >/dev/null
docker compose exec -T db pg_dump -U crm -d crm -Fc > "$backup_dir/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar app -C /app/storage -cf - photos > "$backup_dir/photos.tar"
test -s "$backup_dir/database.dump"
test -s "$backup_dir/photos.tar"
if grep -q '^AUTH_ENCRYPTION_KEY=' .env; then
  sed -n 's/^AUTH_ENCRYPTION_KEY=//p' .env > "$backup_dir/auth-key.txt"
  (cd "$backup_dir" && shasum -a 256 database.dump photos.tar auth-key.txt > SHA256SUMS)
else
  (cd "$backup_dir" && shasum -a 256 database.dump photos.tar > SHA256SUMS)
fi
printf 'Base de datos y fotos: %s\nCopia esta carpeta completa a otro disco o servidor.\n' "$backup_dir"
