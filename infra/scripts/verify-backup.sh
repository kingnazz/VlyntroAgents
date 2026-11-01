#!/usr/bin/env bash
set -euo pipefail
cd /opt/vlyntro-agents
scripts/backup-postgres.sh
backup_file="$(find /opt/backups/vlyntro-agents -maxdepth 1 -type f -name 'hq-*.dump' | sort | tail -n 1)"
test -s "$backup_file"
target="hq_restore_acceptance_$(date +%s)"
dc() { docker compose --env-file .env.production "$@"; }
cleanup() { dc exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$target"; }
trap cleanup EXIT
scripts/restore-postgres.sh "$backup_file" "$target"
dc exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -c "SELECT count(*) AS core_tables FROM information_schema.tables WHERE table_schema='\''public'\''; SELECT count(*) AS owners FROM users WHERE role='\''owner'\''; SELECT count(*) AS audit_events FROM events;"' sh "$target"
temporary_dir="$(mktemp -d /tmp/vlyntro-retention.XXXXXX)"
touch "$temporary_dir/hq-20000101T000000Z.dump" "$temporary_dir/unrelated-file.txt"
touch -d '20 days ago' "$temporary_dir/hq-20000101T000000Z.dump" "$temporary_dir/unrelated-file.txt"
BACKUP_DIR="$temporary_dir" scripts/backup-postgres.sh
test ! -e "$temporary_dir/hq-20000101T000000Z.dump"
test -e "$temporary_dir/unrelated-file.txt"
find "$temporary_dir" -maxdepth 1 -type f -delete
rmdir "$temporary_dir"
echo 'Backup size, disposable restore and retention checks passed.'
