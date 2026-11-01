CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 display_name text NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('owner','admin','viewer')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE agents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, display_name text NOT NULL,
 description text NOT NULL DEFAULT '', role_description text NOT NULL DEFAULT '',
 agent_type text NOT NULL CHECK (agent_type IN ('llm','command','system')),
 provider text, model text, status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online','idle','busy','offline','error','disabled')),
 system_prompt text NOT NULL DEFAULT '', configuration jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workspaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL,
 description text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE channels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 slug text NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '',
 channel_type text NOT NULL DEFAULT 'public' CHECK (channel_type IN ('public','private','direct','system')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,slug)
);
CREATE TABLE channel_members (
 channel_id uuid NOT NULL REFERENCES channels(id), member_type text NOT NULL CHECK(member_type IN ('user','agent')),
 member_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(channel_id,member_type,member_id)
);
CREATE TABLE messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), channel_id uuid NOT NULL REFERENCES channels(id),
 sender_type text NOT NULL CHECK(sender_type IN ('user','agent','system')), sender_id uuid,
 message_type text NOT NULL DEFAULT 'text' CHECK(message_type IN ('text','system','task','approval','artifact','error')),
 body text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', reply_to_message_id uuid REFERENCES messages(id),
 idempotency_key text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), edited_at timestamptz
);
CREATE INDEX messages_channel_recent ON messages(channel_id,created_at DESC,id DESC);
CREATE TABLE tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), channel_id uuid REFERENCES channels(id),
 title text NOT NULL, description text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','queued','running','blocked','needs_approval','completed','failed','cancelled')),
 priority integer NOT NULL DEFAULT 2 CHECK(priority BETWEEN 0 AND 4), created_by_type text NOT NULL, created_by_id uuid NOT NULL,
 assigned_agent_id uuid REFERENCES agents(id), parent_task_id uuid REFERENCES tasks(id), due_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX tasks_workspace_status ON tasks(workspace_id,status,created_at DESC);
CREATE TABLE task_dependencies (
 task_id uuid NOT NULL REFERENCES tasks(id), depends_on_task_id uuid NOT NULL REFERENCES tasks(id),
 PRIMARY KEY(task_id,depends_on_task_id), CHECK(task_id <> depends_on_task_id)
);
CREATE TABLE routing_roots (
 id uuid PRIMARY KEY, job_count integer NOT NULL DEFAULT 0 CHECK(job_count BETWEEN 0 AND 20)
);
CREATE TABLE jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), task_id uuid REFERENCES tasks(id), agent_id uuid NOT NULL REFERENCES agents(id),
 job_type text NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','claimed','running','waiting','completed','failed','cancelled')),
 priority integer NOT NULL DEFAULT 2, payload jsonb NOT NULL DEFAULT '{}', result jsonb,
 attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 5),
 available_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz, claimed_by text, completed_at timestamptz,
 last_error text, idempotency_key text UNIQUE, root_id uuid REFERENCES routing_roots(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_claim ON jobs(priority DESC,available_at,created_at) WHERE status='queued';
CREATE TABLE runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), task_id uuid REFERENCES tasks(id), job_id uuid REFERENCES jobs(id), agent_id uuid NOT NULL REFERENCES agents(id),
 status text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, input_summary text NOT NULL DEFAULT '',
 output_summary text NOT NULL DEFAULT '', metadata jsonb NOT NULL DEFAULT '{}', error text
);
CREATE INDEX runs_workspace_recent ON runs(workspace_id,started_at DESC);
CREATE TABLE run_steps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES runs(id), step_number integer NOT NULL,
 step_type text NOT NULL, name text NOT NULL, status text NOT NULL, input jsonb, output jsonb,
 started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, error text, UNIQUE(run_id,step_number)
);
CREATE TABLE approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), task_id uuid REFERENCES tasks(id), run_id uuid REFERENCES runs(id),
 requested_by_agent_id uuid NOT NULL REFERENCES agents(id), approval_type text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '',
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 reviewed_by_user_id uuid REFERENCES users(id), review_comment text, created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE INDEX approvals_pending ON approvals(workspace_id,status,created_at DESC);
CREATE TABLE artifacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id), task_id uuid REFERENCES tasks(id), run_id uuid REFERENCES runs(id), message_id uuid REFERENCES messages(id),
 created_by_type text NOT NULL, created_by_id uuid NOT NULL,
 artifact_type text NOT NULL CHECK(artifact_type IN ('text','file','code','image_reference','link','json')), name text NOT NULL,
 mime_type text, storage_path text, content_text text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE namespaces (id text PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), description text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE documents (
 namespace_id text NOT NULL REFERENCES namespaces(id), key text NOT NULL, value jsonb NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(namespace_id,key)
);
CREATE TABLE events (
 id bigserial PRIMARY KEY, workspace_id uuid REFERENCES workspaces(id), namespace_id text REFERENCES namespaces(id), key text,
 action text NOT NULL, actor_type text NOT NULL, actor_id text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_workspace_recent ON events(workspace_id,id DESC);
CREATE INDEX events_namespace_recent ON events(namespace_id,id DESC);
CREATE FUNCTION prevent_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit events are append-only'; END $$;
CREATE TRIGGER events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON events FOR EACH STATEMENT EXECUTE FUNCTION prevent_event_mutation();
CREATE TABLE agent_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL REFERENCES agents(id), token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz, revoked_at timestamptz
);
CREATE TABLE agent_permissions (
 agent_id uuid NOT NULL REFERENCES agents(id), workspace_id uuid REFERENCES workspaces(id), namespace_id text REFERENCES namespaces(id),
 permission text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CHECK(workspace_id IS NOT NULL OR namespace_id IS NOT NULL)
);
CREATE UNIQUE INDEX agent_permission_unique ON agent_permissions(agent_id,coalesce(workspace_id::text,''),coalesce(namespace_id,''),permission);
CREATE TABLE worker_heartbeats (id text PRIMARY KEY, last_seen_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE login_attempts (key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 1, reset_at timestamptz NOT NULL);
