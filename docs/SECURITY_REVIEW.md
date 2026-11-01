# Security and architecture review

Scope: sessions, bearer tokens, REST/MCP parity, Blackboard rules, approval transitions, job claims/recovery, command execution, private channels, artifacts and the Docker deployment boundary.

## Findings addressed before deployment

| Severity | Evidence and exploit path                                                                             | Fix and verification                                                                                                                                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High     | A workspace-level reader could otherwise reach a private channel's data through a linked task or run. | Shared resource reads and list queries enforce channel membership. Integration tests verify direct and indirect denial.                                                                                                                                |
| High     | An approval detached from the exact caption could authorize edited content.                           | Requests capture a canonical content hash; decisions lock the document and verify the hash. Stale-content and agent-bypass tests fail safely.                                                                                                          |
| High     | Replayed message requests could create duplicate agent jobs.                                          | Sender-scoped idempotency keys, an advisory lock and unique routing keys make retry/reconnect idempotent. Concurrent worker claims use row locking and stale recovery checks session advisory locks.                                                   |
| Medium   | A cookie-authenticated cross-origin request could mutate private state.                               | Origin allowlist plus mandatory same-origin Origin on cookie mutations. Negative tests cover missing and foreign origins.                                                                                                                              |
| Medium   | Persisted task-change events could copy an arbitrary description into audit payloads.                 | Task update events store changed field names and status, not description content. Login/token events store hashes and IDs only.                                                                                                                        |
| Medium   | Browser failure snapshots could retain password form values.                                          | The form clears its password after extracting the submission; test teardown clears password fields before diagnostics. Traces, videos and failure screenshots are disabled. A disposable local fixture exposed during initial diagnostics was rotated. |
| Medium   | User-controlled command strings or symlink paths could escape a command workspace.                    | Only configured absolute executables and static arguments run, without a shell. Realpath, timeout, process-group kill, environment allowlist and output caps are covered by adapter tests.                                                             |

## Verified boundaries

Argon2id hashes protect passwords. Session identifiers regenerate at login and are hashed at rest. Cookies are HttpOnly and SameSite Strict, and Secure in production. Login has persisted per-subject/IP failure windows and a separate route rate limit. Logout removes the session. Agent tokens are 256-bit random values, SHA-256 hashed, scoped and revocable; no default agent receives approval-resolution privileges.

Every Blackboard write locks and checks its version. The document and event either commit together or both roll back. Events have no update/delete route and a database append-only trigger. Model output passes strict structured validation and the same policy boundary as API requests. Messages and artifacts render as text, with no HTML injection. Downloads use attachment disposition and safe MIME handling. No arbitrary binary upload or external URL fetch is exposed.

PostgreSQL has no host port mapping. App containers are non-root, have memory limits, drop capabilities and use no-new-privileges. No Docker socket is mounted. Nginx continues to serve existing applications; Agent HQ's Caddy is loopback-only. Logs redact authentication headers and do not include prompts, bodies or provider error response bodies. Database errors return generic responses with request IDs.

## Residual limits and release position

The installed dependency audit found zero high and critical advisories. One moderate minimatch advisory is reachable through the development ESLint dependency. Application requests do not provide glob patterns to ESLint; production runtime dependencies exclude that tool. No unrelated major override was applied.

Humans have installation-wide roles rather than customer tenant boundaries. A configured command executable is trusted code within its container and can use permitted outbound network access. Do not grant it unrelated credentials or mounts. Provider actions can partially commit before a later action fails; run steps expose that result and optimistic versions stop blind replay. No external publishing integration exists, so the application does not claim exactly-once external actions.

DNS and trusted HTTPS were verified. Three high and four medium findings above were addressed. No high or critical runtime finding remains confirmed in this review. Infrastructure and authenticated workflows passed the release checks; live provider execution still requires credentials and a real execution test. These limits are recorded in the verification document rather than represented as successful tests.
