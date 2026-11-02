# Second Brain V1

Deployment and acceptance evidence: [Second Brain production verification](SECOND_BRAIN_RELEASE.md).

Agent HQ now combines the AI team, durable shared knowledge, and its existing operational controls. This is an additive PostgreSQL feature. Blackboard remains operational state; Brain holds individually attributable facts, notes, observations, decisions, preferences, ideas, and references. There are no embeddings, external search services, or external connectors.

## Everyday use

- **Today** opens by default. It shows real pending approvals, Brain review work, follow-ups/due tasks, agent availability, completed tasks, memories, decisions, captures, and projects. Command Center remains available.
- **Capture**, visible throughout the app, opens with **Cmd+K** on macOS or **Ctrl+K** elsewhere. This shortcut was unused. Enter text without choosing a record type. The original text commits before processing begins. The confirmation means saved, not successfully extracted.
- **Memory** searches durable items and matching structured entities. Filter by kind, project, person, importance, source, status, and date. Open a memory to inspect its content, source, relationships, and revision history.
- **Decisions** is the same memory service filtered by kind. Human-authored decisions, AI proposals, and human-confirmed AI proposals remain distinguishable. No rationale is generated unless a source supplies it.
- **Projects / People** aggregate linked memory, decisions, relationships, existing tasks, source messages, artifacts, agent runs, and audit activity. Organizations are available through these views, memory links, and search.
- **Save to Brain** on a message, task, run, or artifact opens an editable confirmation surface. Choose kind, title, summary and related entities, then Save. The original source is linked and its author remains inspectable.

## Data and provenance

Migration `002_second_brain.sql` adds eight tables:

| Table             | Purpose                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `brain_items`     | One durable, attributable memory per row; validity dates, importance, confidence, status and supersession |
| `brain_revisions` | Immutable numbered snapshots, including links, editor identity and reason                                 |
| `projects`        | Workspace projects with lifecycle, summary and optional owner                                             |
| `people`          | Name-first people; email and other contact fields are optional                                            |
| `organizations`   | Companies and teams; domains are optional                                                                 |
| `brain_links`     | Validated polymorphic relationships to entities and existing operational objects                          |
| `entity_links`    | Controlled relationships between projects, people, organizations and existing tasks                       |
| `capture_inbox`   | Immutable raw source plus processing state, parsed result, errors and review suggestions                  |

New indexes cover workspace/status/kind/date, normalized entity matching, relationship targets, and native full-text retrieval. Polymorphic targets are validated in the shared application service against the same workspace and existing object permissions. No old table or initial migration is replaced. Existing tasks are reused for follow-ups.

`created_by_type/id` always describe the actual contributing actor. Original source authorship is separate. An AI extraction from a human capture is still an **agent-contributed inference from that capture**, not a statement newly authored by the human. Confirming a proposal adds the confirming human and timestamp to server-controlled metadata without changing the original contributor. Raw captures remain readable by human managers.

Every creation takes revision 1. Edits, link changes, confirmations, archives, and supersession create additional snapshots. `expected_revision` prevents lost updates; stale edits return 409. Superseding creates a replacement linked by `supersedes_id` and preserves the original item and both histories. Original source links cannot be silently erased. Database triggers reject revision mutation and changes to the raw capture or capture author/source fields.

## Permissions and privacy

| Permission      | Meaning                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| `brain.read`    | Search/read authorized workspace memory and structured entities                |
| `brain.write`   | Create attributable notes/observations/facts and entities where granted        |
| `brain.propose` | Submit proposed memory or raw captures                                         |
| `brain.manage`  | Human owner/admin management; agent grants do not bypass the human requirement |

ChatGPT, Muse and Codex receive read/write/propose only in workspaces they already access. Grokbot receives read/propose. New agents require explicit grants. Existing disabled agents stay disabled. Seed is idempotent; the migration grants only the named agents within existing workspace scopes. No token receives unrestricted management.

Agent decisions and preferences are forced to `proposed`, even if an API request asks for `active`. Only an owner/admin can confirm, edit, supersede or archive memory. Agents cannot rewrite authoritative human history. Viewers can read ordinary Brain data; raw capture review, revision history and context preview require a human manager. Human roles follow this installation's existing global internal-workspace model; this feature does not introduce customer tenancy or new authentication.

Brain retrieval checks both workspace permission and source permissions. Private/direct channel restrictions carry through saved source objects, later unlinking, and supersession. Sensitive items are withheld from agents and viewers. Revision history is manager-only because old snapshots may contain text subsequently marked sensitive.

Practical secret detection recognizes common API token/private-key patterns, credential URLs, password/key/token assignments, and configured server secret values. Automatic memory proposals containing these are rejected. A human secret-like capture is retained in a manager-only review state and never sent to a provider. Save a redacted manual memory instead; retrying the original sensitive capture is prohibited. This is a practical safeguard, not a complete data-loss-prevention classifier. Audit/SSE contain IDs, actions, status and counts, not capture bodies, model prompts or secret content.

## Capture lifecycle and extraction

1. REST commits `raw_text` unchanged with the capturing actor and an idempotency UUID. Reusing the UUID with different text/scope returns 409.
2. The existing worker scans pending captures. Provider availability and Brain/task permissions are checked before extraction. Normal job execution remains on the existing PostgreSQL queue.
3. With no configured eligible provider, raw capture remains `new`. The Inbox explains manual conversion and retry. All manual Brain functions work without any provider.
4. A configured existing LLM adapter receives only the bounded raw capture and a strict extraction schema. There is one provider call per extraction attempt, bounded by the adapter's existing 60-second timeout and output token limit. No model chain or embedding call is added.
5. Validate structure, bounded counts, literal evidence, explicitly present names/contact fields, secret checks and date policy before committing anything. Missing surnames, emails, domains and precise dates remain absent. Vague dates preserve `timing_phrase`; only explicitly present ISO calendar dates may populate `due_at` in V1.
6. Entity matching normalizes Unicode, case, punctuation and whitespace. People match by email; name-only collisions require human review, including first-name collisions. Organization name/domain and project name matching stay workspace-local. Matching is serialized and indexed; ambiguous matches are never silently merged.
7. One transaction commits entities, attributed memory, controlled relationships and existing tasks for follow-ups. An error rolls back structured changes while keeping raw capture. A session advisory lock prevents two workers from processing the same capture simultaneously. Processed captures cannot be retried into duplicate records; abandoned processing is recovered after the lock is gone.
8. A successful capture becomes `processed`; ambiguity becomes `needs_review`. Malformed/provider failures become `failed` with a safe error message. Secrets also use `needs_review` without extraction.

In **Brain Inbox**, use **Edit / convert manually**, **Retry**, or **Dismiss**. For an ambiguous entity, **Resolve match** explicitly chooses an existing entity or creates a distinct one. Extracted memories get versioned relationships and follow-up tasks link to the selected entity. Dismiss archives the capture without deleting its original text. Proposed decisions/preferences open into memory detail for human confirmation or editing.

Inspect failed processing without printing raw sensitive captures into shared logs:

```sql
SELECT id, workspace_id, status, processing_agent_id, processing_error,
       sensitive, created_at, processed_at
FROM capture_inbox
WHERE status IN ('failed','needs_review','processing')
ORDER BY created_at DESC;
```

After configuring a provider through the protected production environment, recreate API/worker and Retry failed captures. Pending `new` captures become eligible automatically. Do not edit capture source text in SQL. Correct the resulting memory with a reason or supersede it; use provenance and revision history to see what changed.

## Retrieval and agent contributions

`packages/shared/src/brain/retrieval.ts` is the shared retrieval boundary. REST, MCP and worker context use the same policy. Weighted PostgreSQL English full-text search prioritizes title, summary and body, with entity matching, importance and a small recency boost. Recency cannot overwhelm permanent decisions. Entity search includes descriptive fields. Filters and all related-object lookups remain workspace-scoped. There is no external vector infrastructure.

`pnpm exec tsx scripts/brain-search-plan.ts` runs read-only `EXPLAIN (ANALYZE, BUFFERS)` against the actual parameterized recent/text search statements. It prints plan nodes, index names and timings without document contents or connection settings. Local acceptance data used the workspace/recent index and indexed relationship lookups; both queries were below 1 ms. Small fixtures may legitimately use workspace indexes instead of the GIN FTS index. Recheck with representative data before tuning further.

Before an LLM job executes, the worker retrieves context from the instruction, task title/description, relevant entities/project and channel. Only active, currently valid, authorized items are eligible. Default limits are **12 items / 15,000 serialized characters**, with hard ceilings of 15 / 18,000. Each item supplies title/kind, bounded excerpt, contributor, original source author, source ID, dates and relationships. Retrieved text is evidence, not a privileged instruction. Context preview returns these memory items, never hidden system prompts.

Provider output adds optional `brain_proposals`, validated before actions, with at most five concise proposals per run. Durable verified facts, meaningful outcomes, project changes and recurring preferences are appropriate; most responses should return none. No routine successful-run summary or raw command output is automatically stored. Hidden reasoning, intermediate thought traces and secrets are prohibited. Server policy handles invalid/sensitive/unauthorized proposals safely. The command adapter remains unchanged and does not automatically generate memory.

## REST and MCP

REST uses existing authenticated `/api/v1` routing, cookies/bearer scopes, Origin checks, rate limits and generated OpenAPI. Reads, edits and object-ID actions require `workspace_id` in the query; creation bodies include it. Search pagination uses a bounded numeric `cursor` offset and `limit`.

| Route                                                | Operations                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/brain/search`                                      | GET; q, kind, project_id, person_id, organization_id, importance, status, source_type, since, until, limit, cursor |
| `/brain/capture`                                     | POST raw_text, workspace_id, idempotency_key                                                                       |
| `/brain/items`                                       | POST                                                                                                               |
| `/brain/items/:id`                                   | GET / PATCH with expected_revision                                                                                 |
| `/brain/items/:id/archive`                           | POST with expected_revision                                                                                        |
| `/brain/items/:id/supersede`                         | POST replacement and expected_revision                                                                             |
| `/brain/items/:id/revisions`                         | GET, human manager only                                                                                            |
| `/brain/inbox`                                       | GET, human manager only                                                                                            |
| `/brain/inbox/:id/confirm`, `/dismiss`, `/retry`     | POST; manual capture conversion or memory proposal review                                                          |
| `/brain/inbox/:id/resolve-entity`                    | POST suggestion_index and target_id or create_new                                                                  |
| `/brain/entity-links`                                | POST controlled entity relationship                                                                                |
| `/brain/context-preview`                             | POST workspace_id/query, optional project_id; human manager only                                                   |
| `/brain/today`                                       | GET real attention/work/history aggregates                                                                         |
| `/projects`, `/people`, `/organizations`             | GET / POST                                                                                                         |
| `/projects/:id`, `/people/:id`, `/organizations/:id` | GET aggregate detail / PATCH                                                                                       |

Additional MCP tools: `search_brain`, `read_brain_item`, `capture_brain_item`, `list_projects`, `get_project`, `list_people`, `get_person`, `list_decisions`. All use the same services as REST, require workspace IDs, and honor agent permissions. Capture through MCP stores input for safe processing; it does not allow unrestricted item management.

Events include `brain.capture.created`, `brain.capture.processed`, `brain.item.created`, `brain.item.updated`, `brain.item.superseded`, `brain.inbox.created`, `brain.inbox.resolved`, project/person creation/update and entity relationship audit entries. The existing event poll/SSE transport delivers them. There are no audit update/delete routes.

## Deployment, backup and recovery

Use the existing VPS Compose stack and `docs/RUNBOOK.md`. Run a backup and verify its file is nonzero **before** production migration. Test migration 002 with migration 001 unchanged in a fresh local/test database, then run formatting, lint, typecheck, Vitest, Playwright, build and audit. Build sequentially on the VPS, run migration through the new runtime image, then recreate only Agent HQ application services. Retain old images. No PostgreSQL image change, external service, port or unrelated Compose project change is required.

The existing complete `pg_dump -Fc` backup includes all eight new tables, revisions, raw captures, relationships, indexes and permissions. Treat these dumps as private business information. Restore validation must use a disposable `hq_restore_*` database, never overwrite production. Application rollback can use the prior images with the additive schema left in place; do not drop Brain tables to roll back UI code.

Production verification uses only the explicitly authorized architecture decision: keep Agent HQ services and PostgreSQL on the existing VPS. Verify Memory/Decisions/search, a small revision, bounded context preview, audit/SSE, backup and persistence across an Agent HQ restart. Do not populate fictional people/projects or feed a model synthetic personal history in production.

## Future work (not implemented)

Semantic embeddings, pgvector, email/calendar ingestion, Google Drive, Microsoft 365, browser history, dedicated mobile capture, voice capture, automatic daily briefing, cross-workspace personal memory and CRM synchronization are deliberately deferred.
