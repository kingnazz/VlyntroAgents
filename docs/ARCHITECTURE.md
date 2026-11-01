# Architecture

## Services and trust boundaries

Next.js renders the authenticated console. The initial server page checks the session against the API and redirects unauthenticated requests to login. Client data is uncached and all mutations go to Fastify. Nginx owns the existing VPS TLS edge; the private Caddy container routes `/api/*`, `/mcp` and `/events/*` to API and all other requests to web.

Fastify validates bounded inputs with Zod, assigns request IDs, rejects foreign origins and requires same-origin proof on cookie mutations. Sessions and agent tokens contain only hashes at rest. Passwords use Argon2id. Login has both rate limits and a persisted failure window. No registration route exists. Providers are configured with environment variables, never secret values in agent configuration.

PostgreSQL 16 stores relational objects and flexible JSONB state. SQL is parameterized through postgres.js. Checked migrations run atomically under an advisory lock and cannot be edited after application. Foreign keys protect associations and indexes support recent messages, audit reads and queue claims. Humans have installation-wide owner/admin/viewer roles; agents require workspace and namespace grants. Private/direct channels also require membership, including when reached through tasks and runs.

## Work and execution

Messages are persisted chat objects. A UUID idempotency key scopes retries to the sender. Mention routing occurs in the same transaction as message insertion and audit. Valid mentions create linked tasks/jobs. Each originating message has a locked job budget, with a maximum of 20 jobs and a default depth of five. Exceeding either blocks the task and records a human-intervention event.

Workers claim jobs atomically using `FOR UPDATE SKIP LOCKED`. A session advisory lock stays held for execution, while heartbeat and recovery use separate connections. Recovery checks that lock before reclaiming a stale run. Dependencies must complete before claims. Retry delays grow from five seconds to a maximum of five minutes, with at most three attempts by default. Permanent configuration and authorization failures terminate. Provider calls have a 60-second timeout; command execution has a maximum 120-second timeout and bounded output.

Runs describe each execution attempt. Steps record concise action summaries, not prompts or hidden reasoning. Context contains at most 20 recent messages with bounded body lengths, authorized workflow documents and five relevant approvals. Oversized documents are omitted with an explicit instruction to use MCP. Validated provider responses contain a message, proposed state writes and an optional approval request. The worker applies the same policy services as REST and MCP. There is no unrestricted model tool execution, external publishing or remote shell endpoint.

Provider calls are isolated behind adapters for OpenAI, Anthropic and xAI. A configured command agent uses an absolute executable and static argument array with `shell: false`, a real-path checked workspace, a small environment allowlist and process-group termination. Agent availability is derived from server configuration; missing credentials do not prevent application startup.

## Blackboard, decisions and audit

Namespaces belong to workspaces, allowing additional workflows without replacing tables. Every document mutation locks the namespace/key, checks its expected version and inserts an event within the same transaction. Null expected version means create only. State conflicts return 409 with the current version.

The Instagram namespace enforces key-level rules. ChatGPT writes ideas/drafts and weekly briefs. Muse reviews content, appends performance and maintains the brand bible. Only Muse or an owner changes brand rules. Every existing pipeline record must remain present. Published records are immutable.

Publication requests capture a canonical content hash. A human decision locks both the approval and current document, verifies the exact reviewed content, and advances it to approved in the decision transaction. Repeated identical decisions return the original result; contradictory decisions fail. Muse can only record publication of the unchanged approved record with an HTTPS URL. There is no Instagram network action in V1.

Events are append-only, with a database trigger blocking update/delete/truncate and no mutation API. Payloads contain entity IDs and safe summaries, not tokens, passwords, model prompts or provider responses. The authenticated SSE endpoint queries these committed events with ascending reconnect cursors, bounded batches, heartbeat comments and token/session revalidation. It supports four connections per actor and closes slow consumers.

## MCP and artifacts

The official MCP SDK implements stateless Streamable HTTP at `/mcp`. Each request authenticates an agent bearer token. Tools call the shared policy services directly, preserving REST semantics. No legacy SSE transport or agent approval-resolution tool is registered.

Artifacts attach text, code, JSON or HTTPS references to work. Text payloads are bounded to 256 KB, downloads are authenticated safe attachments, and no arbitrary binary MIME types are accepted in V1. Worker outputs are persisted as text artifacts. The local storage interface accepts generated UUID keys only and can later be replaced by S3-compatible storage without changing object identities. The persistent artifact volume is reserved for file-backed expansion.

## Operational limits

This is an internal installation, not customer-isolated SaaS. User roles span workspaces. The model may request work, but policy failures are visible and do not become authorized through retries. Exactly-once external side effects across a process crash are not claimed; external publishing is deliberately absent. A command CLI is trusted container code and must be provisioned with a narrow workspace and credential scope. Backups are daily local dumps with retention; off-server copies remain an operator responsibility.
