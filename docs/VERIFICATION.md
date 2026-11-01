# Verification record

## Local verification

The application was implemented and tested on macOS with Node.js 22 and PostgreSQL 16. The integration suite creates an isolated `hq_test` database, runs the real migrations and seed, and uses HTTP, database queries and the Streamable HTTP SDK transport. It does not replace PostgreSQL with an in-memory emulator.

Passing checks before deployment: formatting, ESLint, TypeScript, Vitest integration tests, Playwright desktop/tablet/mobile workflows, production Next.js build and dependency audit at high severity. Screenshots were visually inspected at desktop and mobile sizes.

Vitest covers authentication, CSRF, viewer denial, session hashing/logout, version roundtrips and concurrent conflicts, transactional rollback on event failure, append-only audit, brand locks, performance append rules, exact-content approval, stale-content rejection, agent scopes/revocation, message idempotency, SSE delivery, private-channel indirection, dependency constraints, concurrent claims, deterministic adapter execution, provider failure/retry, missing keys, approval resume, health, MCP parity and command adapter restrictions.

The deterministic adapter is used only inside the test suite. No fake agent response is seeded or deployed to production.

## Production verification

Deployment evidence and any outstanding DNS/provider blockers are appended after the VPS rollout. No public HTTPS or live provider success is claimed until it is actually checked.
