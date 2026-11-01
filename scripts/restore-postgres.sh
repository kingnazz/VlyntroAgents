#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_file="${1:?Usage: restore-postgres.sh /absolute/backup.dump target_database}"
target_database="${2:?A new disposable target database name is required}"
[[ "$target_database" =~ ^hq_restore_[a-zA-Z0-9_]+$ ]] || { echo 'Target must begin hq_restore_ and contain only letters, numbers and underscores.' >&2; exit 1; }
test -s "$backup_file"
# Only a new database is allowed. This command never restores over the active database.
docker compose --env-file .env.production exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$target_database"
docker compose --env-file .env.production exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-privileges --exit-on-error' sh "$target_database" < "$backup_file"
echo "Restored into $target_database. Verify before switching DATABASE_URL."
