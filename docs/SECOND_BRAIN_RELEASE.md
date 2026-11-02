# Second Brain production verification

Verified November 2, 2026, Pacific time. Live application: [agents.vlyntro.com/app](https://agents.vlyntro.com/app). Branch: `codex/second-brain-v1`. Application image release: `16bb1856584000712fd89abdaf16d4851409889a`. A subsequent documentation-only commit records this evidence; it does not change the running application code. Nothing was merged.

## Delivered

Migration `002_second_brain.sql` adds `brain_items`, `brain_revisions`, `projects`, `people`, `organizations`, `brain_links`, `entity_links`, and `capture_inbox`. Migration 001 is unchanged. PostgreSQL 16, the existing worker/queue, operational tables, audit/event stream, MCP, authentication, Docker Compose stack, and current Vlyntro visual system are retained.

The release adds Today, Memory, Projects, People, Decisions, Brain Inbox, organizations, and linked detail views; global Capture (Cmd+K / Ctrl+K); and Save to Brain for messages/tasks/runs/artifacts. The 28 new REST method/path combinations are documented in [SECOND_BRAIN.md](SECOND_BRAIN.md). Eight scoped MCP tools use the same services. Native PostgreSQL retrieval supplies at most 12 / 15,000 characters by default, bounded by a 15-item / 18,000-character ceiling. Agent read/write/propose permissions remain workspace-specific; human management and confirmation cannot be obtained through an agent token.

## Local validation

| Check                                    | Result                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Formatting / ESLint / TypeScript         | Passed                                                                                                            |
| Vitest with real PostgreSQL 16           | **82 passed**: all 40 existing tests and 42 Brain tests                                                           |
| Playwright acceptance                    | **12 passed** across desktop, tablet and mobile; existing and Brain workflows                                     |
| Production build                         | Passed locally and in the VPS Docker build                                                                        |
| Browser rehearsal after partial-edit fix | Passed, including summary-only decision edit, search, revisions, context preview, audit and desktop/mobile views  |
| Console / horizontal overflow            | Clean in acceptance flows; desktop/mobile captures visually inspected                                             |
| Dependency audit                         | No production vulnerabilities; no high/critical advisories; one existing moderate development dependency advisory |
| SQL plans                                | Actual parameterized recent/text queries inspected; workspace and relationship indexes used                       |
| Git diff checks                          | Passed; no dependency, Compose, Dockerfile or initial-migration changes                                           |

The rehearsal found and fixed optional-field defaults in partial patch schemas. Regression tests now prove summary-only edits cannot reset decision kind/importance/provenance, and project description edits cannot reset lifecycle status/source metadata.

## Production migration and deployment

The previous production checkout was clean at launch commit `e5863e609194617018dd51507d7323377e5c7fca`. Runtime images were `d031288`; the web image was the launch SHA. The new branch extends that deployed code, including the existing branding/public site.

Pre-migration backup: `/opt/backups/vlyntro-agents/hq-20261102T175644Z.dump`, **64,509 bytes**, verified nonzero. Images were built sequentially using the existing deployment procedure. Migration 002 applied successfully through the new runtime image; structural seed completed idempotently. Only Agent HQ API, worker and web containers were recreated. Existing PostgreSQL/Caddy containers and all unrelated containers retained their IDs.

These original counts were identical immediately before and after migration/deployment:

| Existing data        | Count |
| -------------------- | ----- |
| Users                | 1     |
| Messages             | 32    |
| Tasks                | 16    |
| Runs                 | 4     |
| Approvals            | 1     |
| Artifacts            | 0     |
| Blackboard documents | 6     |
| Audit events         | 113   |

The initial migration checksum remains `a46b6153aad6b833ed2dd806c2c0e7a2b606fd6953bf5a4b7789a29f2ed39812`. Later acceptance activity adds the explicitly authorized Brain records, login/audit events, a revoked test token, and one harmless queue restart probe; these are not migration changes or fabricated agent successes.

## Safe live acceptance

Owner-created architecture decision: **`911b3ce9-8061-4f5a-b31b-45e8552d20eb`**, title **Vlyntro Agents architecture**. Its body is exactly the architecture choice supplied in the request: keep application services and PostgreSQL on the existing VPS instead of adding Vercel to core Agent HQ. It is active, high importance, user-authored, with **two immutable revisions** after a summary-only edit. No other personal information was invented.

Verified over trusted HTTPS:

- Owner sign-in through the browser form and API session.
- Today, Memory, Projects, People, Decisions and Brain Inbox.
- Decision search, memory detail, provenance, revision history and bounded context preview.
- A live `brain.item.updated` SSE event containing identifiers rather than document content.
- REST/MCP Brain search parity, discovery of all eight Brain tools, cross-workspace denial, and human-only preview enforcement. The temporary token was revoked.
- Existing General messages, Tasks, Approvals, Runs, Artifacts, Blackboard and Activity.
- Desktop 1440px and mobile 390px flows, without console errors or horizontal overflow.
- API health, connected PostgreSQL and a healthy persistent worker.

PostgreSQL and the three app services were restarted. The same decision, revisions, search, context preview, owner and audit records remained available. The existing persistence acceptance script also verified prior messages/tasks/jobs/runs, the human approval, Blackboard value/version, initial migration and audit event, then verified a fresh job was claimed once after restart. With no provider key it correctly recorded a terminal unconfigured-provider outcome, not a model success.

Production Capture separately stored the **same authorized 143-character architecture text** unchanged, appeared in Brain Inbox without an LLM, and was archived without deletion. Capture ID: **`2aa7323e-f737-4d80-ac2c-8dda9fc1cc43`**. This adds no duplicate memory or fictional person/project.

## Backup and service isolation

After acceptance, backup `/opt/backups/vlyntro-agents/hq-20261102T181047Z.dump` was **93,622 bytes**. It restored successfully into disposable database `hq_restore_second_brain_20261102`. The restore contained **31 public tables**, both migration records, the active owner decision at revision 2, both snapshots, and the archived raw capture with all 143 original characters. The disposable database was dropped after verification. The live database was never overwritten. The existing backup timer remains active.

All five Agent HQ services are healthy. Caddy container `7a6ca339a49a` and PostgreSQL container `6256c41fec6f` retained their identities. The six unrelated sales/coffee containers retained their IDs and were not restarted. Both [sales.arctechone.com](https://sales.arctechone.com) and [irinna.coffee](https://irinna.coffee) returned HTTP 200. DNS/proxy configuration and unrelated service configuration were not changed.

With the real production record present, the recent search executed in **0.363 ms** and text search in **0.453 ms** in read-only EXPLAIN checks. This is a small-data smoke check, not a large-scale performance claim.

## Remaining configuration

OpenAI/Anthropic/xAI credentials are still absent, and the optional command adapter remains unconfigured. Therefore real provider extraction and live model-contributed memory remain unverified; their deterministic adapters, validation, permission enforcement, unavailable-provider behavior, deduplication and recovery paths are covered locally. All manual Brain functions operate without credentials.

Next step: configure an intended provider through the protected server environment, recreate API/worker, and run a small real capture with source review. No vector infrastructure or external connectors are required.
