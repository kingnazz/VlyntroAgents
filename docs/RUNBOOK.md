# Production runbook

Production URL: [agents.vlyntro.com](https://agents.vlyntro.com). MCP: [agents.vlyntro.com/mcp](https://agents.vlyntro.com/mcp).

VPS: `root@sales.arctechone.com`, port 2222, dedicated local key `~/.ssh/id_ed25519_codex_sales`. Use an explicit port because local SSH aliases may differ. Deployment path: `/opt/vlyntro-agents`. Project name: `vlyntro-agents`. Do not operate on the unrelated `arcsales` or `coffee` Compose projects.

## Services

| Service  | Purpose                       | Access                                         |
| -------- | ----------------------------- | ---------------------------------------------- |
| web      | Next.js dashboard             | Caddy only                                     |
| api      | REST, sessions, SSE, MCP      | Caddy and web only                             |
| worker   | Persistent jobs and heartbeat | PostgreSQL and provider outbound               |
| postgres | PostgreSQL 16                 | Internal Docker network, no published port     |
| caddy    | Path routing                  | `127.0.0.1:3080`, existing Nginx proxies to it |

Use `cd /opt/vlyntro-agents` for all commands below. Define a shell helper without secrets:

```sh
dc() { docker compose --env-file .env.production "$@"; }
```

## Deploy and update

1. Check `git status`, `dc ps`, `df -h /`, `free -h`, and existing host services.
2. Run `scripts/backup-postgres.sh`. Record the deployed Git SHA and image tag.
3. Fetch the reviewed branch, then fast-forward only: `git fetch origin && git pull --ff-only`.
4. Build sequentially: `COMPOSE_PARALLEL_LIMIT=1 dc build`.
5. `dc run --rm --no-deps api pnpm db:migrate`, then `dc run --rm --no-deps api pnpm db:seed`.
6. `dc up -d`. Check health, logs, sign-in, SSE and a harmless task.
7. Run `dc ps` and document the new SHA. Never delete named data volumes during an update.

Keep `.env.production` mode 600. Do not run `docker compose config` into a transcript because it expands secrets. Do not print container environments or database URLs. Model or provider-key changes require `dc up -d --force-recreate api worker`; restart alone does not reload an env file.

For one-shot owner creation or production acceptance, combine a separate protected bootstrap env file with `compose.admin.yaml`. Use that override only with `run --rm`, then remove the server bootstrap file after the acceptance checks. The normal API and worker environment must not retain the owner password.

### Frontend-only releases

For a UI-only change with no API, worker, schema, or dependency changes, keep `IMAGE_TAG` on the existing runtime release and set `WEB_IMAGE_TAG` to the new immutable Git tag in the protected `.env.production` file. The web tag falls back to `IMAGE_TAG` when unset.

Run `COMPOSE_PARALLEL_LIMIT=1 dc build web`, then `dc up -d --no-deps --wait web`. Do not run migrations, seed data, or recreate other services for a frontend release. Verify login, fonts/icons, navigation, messages, approval state, mobile layout, and SSE. Compare API/worker/PostgreSQL container IDs before and after.

For a frontend-only rollback, restore the previous `WEB_IMAGE_TAG` and run `dc up -d --no-deps --wait web`. Keep both web images until the new release is verified.

## Second Brain releases

Follow [Second Brain V1](SECOND_BRAIN.md). Migration `002_second_brain.sql` adds eight tables and workspace-scoped grants; leave `001_initial.sql` unchanged. Before migration, run the existing backup, check the printed path with `test -s`, record its size, and record existing table counts and app/other-service container IDs. Apply the migration using the newly built runtime image. Recreate only `api`, `worker`, and `web`; leave PostgreSQL, routing and unrelated projects intact. Verify existing data counts, health, login, Today, every Brain view, capture/search, Messages, Tasks, Approvals, Runs, Blackboard, MCP and SSE. A harmless owner architecture decision must survive an Agent HQ restart and appear in the next backup/restore validation.

Pending captures remain usable without provider keys. Failed processing appears in Brain Inbox with a safe error. Retry after fixing provider configuration; do not overwrite raw text. Ambiguous people require **Resolve match**. Incorrect memory should be edited with a reason or superseded from its detail view; source and revisions remain available. Secret-like captures are held for human review and cannot be retried into a provider. Only a redacted manual memory should be saved from those records.

All Brain data is in the existing database dump; no new volume or backup job is needed. Retain the previous runtime/web image tags for rollback against the additive schema. Do not delete Brain tables or migration records during an application rollback.

## Roll back

Use an existing reviewed previous commit and its immutable image tag. Recreate only app services against compatible migrations. Database migrations are forward-only and checked. If a schema rollback is needed, stop Agent HQ writers, restore a backup to a new database, verify it, and plan a DATABASE_URL cutover. Never restore over the active data volume. Keep the failed release available for diagnosis and do not reset unrelated work.

## Health and failed work

```sh
dc ps
curl --fail http://127.0.0.1:3080/api/v1/health
curl --fail https://agents.vlyntro.com/api/v1/health
dc logs --tail 100 api worker
dc exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,status,attempts,last_error FROM jobs WHERE status IN ('\''failed'\'','\''queued'\'') ORDER BY created_at DESC LIMIT 20"'
```

The UI shows failed runs, safe steps and pending decisions. Avoid sharing raw message/command output if it contains private operational data. `dc restart worker` waits for a bounded active job to finish, then the new worker resumes queued work. Only restart Agent HQ services. PostgreSQL data survives container restarts through the named volume.

## DNS and TLS

The required record is `A agents.vlyntro.com = 163.245.218.6`. Remove conflicting AAAA records if the VPS is not reachable on that IPv6 address. Verify resolution with `dig +short agents.vlyntro.com`. No DNS change is made by deployment scripts.

After DNS resolves, run `ACME_EMAIL=owner@example.com bash scripts/enable-tls.sh`. This obtains a Let's Encrypt certificate with webroot validation, installs the Agent HQ TLS virtual host, validates Nginx and reloads it. Certbot's existing timer renews certificates; the installed deploy hook reloads Nginx after a valid renewal. Confirm with `curl -I https://agents.vlyntro.com/login` and `openssl s_client -connect agents.vlyntro.com:443 -servername agents.vlyntro.com`.

While public DNS/TLS is pending, access the deployed stack through an encrypted SSH tunnel for checks. The loopback app still enforces the production Origin and Secure cookies. Do not enter passwords over a public cleartext HTTP address.

## Back up and restore

Daily backup: `vlyntro-agents-backup.timer`, 03:17 UTC. The dedicated systemd service avoids enabling the VPS's inactive global cron daemon. Location: `/opt/backups/vlyntro-agents`. Retention: 14 daily files. Logs: `/var/log/vlyntro-agents-backup.log`. Dumps are mode 600 and use PostgreSQL's custom format. The directory is separate from the active database volume. Check scheduling with `systemctl list-timers vlyntro-agents-backup.timer`; run the scheduled unit manually with `systemctl start vlyntro-agents-backup.service`.

```sh
scripts/backup-postgres.sh
scripts/restore-postgres.sh /opt/backups/vlyntro-agents/hq-TIMESTAMP.dump hq_restore_check
dc exec postgres sh -c 'psql -U "$POSTGRES_USER" -d hq_restore_check -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='\''public'\''"'
dc exec postgres sh -c 'dropdb -U "$POSTGRES_USER" hq_restore_check'
```

The restore script requires a new `hq_restore_*` database. Never substitute the active database name. For recovery, verify the disposable restore, then arrange a maintenance window and explicit connection cutover. Database dumps include secret hashes and private content and must be protected. Add encrypted off-server copies separately.

## Agent operations

Create/rotate/revoke tokens with `dc exec api pnpm agent:token:create chatgpt`, `dc exec api pnpm agent:token:rotate chatgpt` or `dc exec api pnpm agent:token:revoke chatgpt`. Tokens are displayed once. Store them directly in the client secret store; never paste them into logs or Git.

Disable an agent from its dashboard profile. The server cancels queued/waiting work and rejects its tokens while disabled. Active execution is bounded and must finish before deployment changes. Agent model identifiers can be changed through the owner/admin `PATCH /api/v1/agents/:id` endpoint. Environment model variables affect initial seed only, so reseeding does not overwrite an operator's model choice.

Provider keys belong only in `.env.production`. Add the selected key and recreate API/worker. Default missing-key agents are ChatGPT (OpenAI), Muse (Anthropic), Grokbot (xAI) and Codex (command adapter). System needs no credential. Check current availability in the dashboard after the worker heartbeat refreshes.

To enable Codex, follow README's controlled command setup and mount only its dedicated workspace. No Docker socket or host-root mount is permitted. To inspect its work, use Runs and Artifacts; output is bounded and known server secrets are redacted.
