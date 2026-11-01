# Verification record

Verified October 31, 2026, Pacific time. Application image release: `d031288`. Later documentation and verification-script commits do not change the running application code. The VPS checkout tracks `codex/agent-hq`.

## Deployment

| Item              | Verified result                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Production URL    | https://agents.vlyntro.com                                                                                         |
| VPS and directory | `sales.arctechone.com`, SSH port 2222, `/opt/vlyntro-agents`                                                       |
| DNS               | Both authoritative nameservers, Cloudflare and Google return `163.245.218.6`; no AAAA record was returned          |
| TLS               | Trusted Let's Encrypt certificate for `agents.vlyntro.com`, expires January 29, 2027; Certbot renewal timer active |
| Edge              | Existing Nginx retained; HTTPS proxies to loopback Caddy at `127.0.0.1:3080`; HTTP redirects to HTTPS              |
| Containers        | `web`, `api`, `worker`, `postgres`, `caddy`, all healthy                                                           |
| Database          | PostgreSQL 16.13; no host port is published                                                                        |
| Migration         | `001_initial.sql` applied; structural seed installed without fabricated conversations                              |
| Health            | Public and VPS-local endpoints return HTTP 200, `healthy`, database connected, recent worker heartbeat             |
| Other sites       | Existing sales and coffee sites still return HTTP 200                                                              |

## Local checks

Formatting, ESLint, TypeScript, production build, and `git diff --check` passed. **40 Vitest tests** passed against real PostgreSQL 16, including concurrent claims/writes and transactional rollback. **Three Playwright workflows** passed at desktop, tablet and mobile sizes. Screenshots were visually inspected. The browser suite captures uncaught errors and console errors; the final passes were clean.

The full dependency audit found no high or critical advisory and one moderate minimatch advisory in development ESLint. `pnpm audit --prod --audit-level moderate` reported no known vulnerabilities. Production runtime dependencies exclude ESLint and the development database helper.

## Acceptance coverage

| Required area                 | Local evidence                                                                             | Production evidence                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Authentication                | Invalid password, cookie policy, CSRF, viewer denial, logout invalidation                  | Owner UI login, invalid password, private rejection, secure session, logout and reuse rejection               |
| Blackboard roundtrip/conflict | Create/read/update, simultaneous stale writes                                              | Versions 1 and 2, stale write returns 409 with current version                                                |
| Atomic event writes           | Forced event-insert failure rolls back document                                            | Successful writes have matching persisted events                                                              |
| Append-only audit             | HTTP and database mutation attempts rejected                                               | PATCH/DELETE routes return 404                                                                                |
| Brand bible                   | ChatGPT denied; Muse and owner allowed                                                     | ChatGPT reads and receives 403 on write                                                                       |
| Pipeline policy               | Draft/review/approval rules, stale content rejection, full handoff ownership               | Harmless action-review approval exercised; no publication was triggered                                       |
| Token scope/revocation        | Hash storage, missing scopes, revoked-token denial                                         | Namespace scope denied, hash verified, revoked token rejected                                                 |
| Messaging and SSE             | Persistence and event stream                                                               | Human posts, external posts appear without refresh at three viewport sizes                                    |
| Mention routing               | One idempotent job and deterministic test-adapter response                                 | One message creates exactly one job, one claim and a persisted run                                            |
| Queue concurrency/recovery    | Two claim attempts yield one owner; a held session lock prevents stale recovery            | Fresh queue work processed after restart                                                                      |
| Handoff limits                | Depth five stops routing and blocks the task                                               | No deliberate production loop was started                                                                     |
| Approvals                     | Human-only, unchanged-content binding, idempotency, task resume                            | Muse bearer token requests harmless review; owner approves in UI; repeated approval returns original decision |
| MCP parity                    | State and message parity with REST                                                         | Streamable HTTP state write read through REST; MCP message persisted, streamed and rendered in the dashboard  |
| Provider failure              | Transient retry and permanent failure policies                                             | Missing-key jobs fail visibly without crashing the worker                                                     |
| Missing credentials           | Unconfigured adapter remains offline                                                       | All services operational with four execution agents offline                                                   |
| Dashboard                     | Login, channels, tasks, approvals, agents, runs, artifacts, Blackboard, settings, activity | Same workflow passed in desktop, tablet and mobile browsers, including console and overflow checks            |
| Health                        | Database/worker checks                                                                     | Healthy inside the VPS and externally over trusted HTTPS                                                      |

The safe production API script passed **13 named checks**. Dedicated MCP and persistence scripts added message/SSE checks and restart evidence. Provider execution was not simulated in production. The deterministic model adapter exists only in tests.

## Persisted production evidence

- Routing message: `32054611-9e4b-44ed-a0d2-dc9c1a1fe377`.
- Exactly one routing job: `b0471aaa-22f2-46de-b50c-18991fc42186`.
- Routing run: `e254187f-4d80-480a-828e-01e3b6bc5bcb`. It records missing provider configuration, not a successful model response.
- Human-approved harmless request: `a5b807f7-042c-47e8-a46a-87f16658ede1`.
- MCP message: `b3d58fc2-d5e6-477c-aad1-9fadf565911d`. Its text explicitly identifies a transport test with no model invocation.

All five Agent HQ containers were restarted. The owner account, password hash, message, task, job, run, approval decision, document value/version, migration record and audit event survived. A fresh harmless probe was claimed once and created a run after restart. The worker remained healthy. No unrelated application container was restarted by this deployment.

## Backups

Manual dump `hq-20261101T004322Z.dump` was 56,377 bytes. A disposable restore contained 23 public tables, one owner and the expected audit data. The temporary database was dropped afterward. Retention testing removed only an expired matching backup and retained an unrelated file.

The dedicated `vlyntro-agents-backup.timer` is active, scheduled daily at 03:17 UTC. A manual run of its service succeeded and created `hq-20261101T005316Z.dump`, 58,878 bytes. Dumps are outside the active data volume and private to the host administrator. Log rotation is installed. The inactive global cron daemon was left unchanged.

## Remaining configuration

ChatGPT, Muse and Grokbot are offline because no OpenAI, Anthropic or xAI key was supplied for this application. Codex is offline because its controlled command adapter is not enabled or installed. System is idle and the persistent worker is healthy. Actual provider execution and the complete live model-driven content loop remain unverified.

Add credentials through a protected server environment file, configure the command adapter if needed, recreate API/worker, then repeat the harmless routing check. No publishing, external messages, deployment actions or destructive operations were triggered by the production workflow test. Owner credentials are kept outside Git in a protected local file; the bootstrap password is not present in normal running service environments.
