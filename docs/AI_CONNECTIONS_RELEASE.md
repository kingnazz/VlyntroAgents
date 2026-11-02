# AI connections production verification

Verified November 2, 2026, Pacific time. Live setup: [Connect your AI](https://agents.vlyntro.com/connect). Application branch: `codex/connect-your-ai`. API, worker and web image release: `b8f790b363b929029d7547130b388f9e36417746`. A subsequent documentation-only commit records this evidence. [PR #2](https://github.com/kingnazz/VlyntroAgents/pull/2) is open; this feature has not been merged into the default branch.

## Delivered

Owners/admins can choose among seven AI client guides, copy a setup prompt or MCP command, download a portable skill/local plugin, approve OAuth access in the browser, and check or revoke each connection. Advanced tokens are shown once and can be rotated. Independent identities are bound to one workspace and limited to Brain reading and optional capture submission. The existing worker agents, Brain visibility rules and audit/provenance model remain intact. See [AI_CONNECTIONS.md](AI_CONNECTIONS.md) for setup, protocol details, limits and rollback.

## Validation

| Check                                       | Result                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Formatting, ESLint, TypeScript, diff checks | Passed                                                                                                                                                 |
| Vitest with PostgreSQL 16                   | **121 passed**, including all 82 existing tests and 39 connection tests                                                                                |
| Full Playwright regression                  | **12 passed**, desktop/tablet/mobile, against a fixed production build                                                                                 |
| New browser acceptance                      | Passed: setup guides, skill download, one-time token reveal/dismissal, verification, revocation, consent, read-only access, safe login return and CORS |
| Local and VPS Docker production builds      | Passed                                                                                                                                                 |
| Production dependency audit                 | No known vulnerabilities; middleware pinned to patched `@fastify/middie` 9.3.6                                                                         |
| Skill and plugin validation                 | Skill validator and Claude strict plugin validator passed; downloaded ZIP integrity verified                                                           |
| Caddy                                       | New OAuth/discovery routes validated; app Caddy recreated to remount and load the updated configuration                                                |
| Live browser                                | Seven guides rendered, Copy MCP URL worked, plugin downloaded, desktop/mobile had no horizontal overflow or console errors                             |

The initial development-server regression run had one interrupted mobile login while the API hot-reloaded. The complete fixed-build run subsequently passed all 12 tests. Concurrent manual/browser testing also exercised the existing rate limiter; the release checks used the configured limits without weakening them.

## Backup and migration

Fresh backup: `/opt/backups/vlyntro-agents/hq-20261102T222038Z.dump`, **93,619 bytes**, mode **600**. It restored successfully into `hq_restore_connect_20261102`, with all 31 existing public tables, and that disposable database was removed.

Migration `003_ai_connections.sql` applied successfully, adding exactly five tables and three nullable token columns. The production table count is now **36**. Before/after checks preserved the existing 1 user, 5 operational/system agents, 1 workspace, 32 messages, 16 tasks, 5 runs, 1 Brain item and 1 capture. The original active architecture memory `911b3ce9-8061-4f5a-b31b-45e8552d20eb` remained readable through the new scoped MCP connections. No running production jobs were present at cutover.

API, worker, web, Caddy and PostgreSQL health checks passed after deployment. The PostgreSQL container retained ID prefix `6256c41fec6f`; all six unrelated `arcsales`/`coffee` containers retained their original IDs. The unrelated Sales and Coffee HTTPS sites both returned 200 afterward. `.env.production` remains mode 600, and no owner password or new provider key was added to normal service environments.

## Live protocol verification

The production check performed real HTTPS discovery, owner login/consent, public-client registration, S256 code exchange, SDK MCP identity/search/read calls, manual token rotation, OAuth refresh rotation, resource-bound REST rejection, refresh replay revocation, and credential-free setup/download requests. The existing architecture memory was retrieved without altering Brain content or invoking a provider.

Two clearly labelled release-verification identities were created:

- Static-token connection: `80a15cfb-6917-410e-8ff5-d0ed335bc7b4`.
- OAuth connection: `1b127939-aecf-4457-8ff6-447f2dec7e34`.

Both are revoked and retained for audit. The final database check reported **0 active AI connections** and **0 live connection credentials**. The original memory/capture counts remain 1 each. Verification session cookies were invalidated after the checks.

This proves the deployed connector flow, not installation into the user's ChatGPT, Claude, Grok or other accounts. Those clients still require their account owner's connector setup and browser approval. Plan availability, administrator controls, skill support and third-party client compatibility remain governed by each client. Internal Muse still requires its server-side Anthropic provider key for model execution.
