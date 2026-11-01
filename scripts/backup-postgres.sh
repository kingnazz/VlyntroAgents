#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
backup_dir="${BACKUP_DIR:-/opt/backups/vlyntro-agents}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/hq-$timestamp.dump"
temporary_file="$backup_file.partial"
trap 'rm -f -- "$temporary_file"' EXIT
docker compose --env-file .env.production exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$temporary_file"
test -s "$temporary_file"
mv -- "$temporary_file" "$backup_file"
find "$backup_dir" -maxdepth 1 -type f -name 'hq-????????T??????Z.dump' -mtime +13 -delete
echo "Backup complete: $backup_file"
