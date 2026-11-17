#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 2 ] || [ "$2" != '--replace' ]; then
  printf 'Uso: bash scripts/restore.sh /ruta/copia --replace\nReemplaza la base de datos del servidor por la copia seleccionada.\n' >&2
  exit 1
fi
backup_dir=$(cd "$1" && pwd)
cd "$(dirname "$0")/.."
(cd "$backup_dir" && shasum -a 256 -c SHA256SUMS)
if [ -f "$backup_dir/auth-key.txt" ] && [ "$(cat "$backup_dir/auth-key.txt")" != "$(sed -n 's/^AUTH_ENCRYPTION_KEY=//p' .env)" ]; then
  printf 'La clave 2FA no coincide. Configura AUTH_ENCRYPTION_KEY en .env con auth-key.txt de la copia y vuelve a ejecutar. No se ha restaurado nada.\n' >&2
  exit 1
fi
# Accept only the photo directory emitted by backup.sh, not arbitrary archive paths.
if tar -tf "$backup_dir/photos.tar" | LC_ALL=C grep -Ev '^photos/?$|^photos/[a-f0-9]{64}\.jpg$|^photos/[a-f0-9]{32}/?$|^photos/[a-f0-9]{32}/[a-f0-9]{64}\.jpg$' >/dev/null; then
  printf 'Archivo de fotos no válido.\n' >&2; exit 1
fi
docker compose stop app
# On failure leave app stopped: do not serve a partially restored dataset.
# Recreate the complete database: a newer workspace absent from this backup must
# not survive a full restore or leave foreign keys that block the old snapshot.
docker compose exec -T db dropdb -U crm --force crm
docker compose exec -T db createdb -U crm crm
docker compose exec -T db pg_restore -U crm -d crm --no-owner --exit-on-error < "$backup_dir/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar app -C /app/storage -xf - < "$backup_dir/photos.tar"
docker compose exec -T db psql -U crm -d crm -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF to_regclass('public.app_sessions') IS NOT NULL THEN DELETE FROM app_sessions; END IF; END \$\$;"
python3 scripts/provision-runtime.py
docker compose up -d pdf app
printf 'Restauración completada. Comprueba obras, partes y fotos antes de continuar.\n'
