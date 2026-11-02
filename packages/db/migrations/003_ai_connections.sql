-- External AI identities are separate from the operational worker agents.
CREATE TABLE oauth_clients (
 client_id text PRIMARY KEY, client_name text NOT NULL, metadata jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id),
 agent_id uuid NOT NULL UNIQUE REFERENCES agents(id), created_by_user_id uuid NOT NULL REFERENCES users(id),
 client_kind text NOT NULL CHECK(client_kind IN ('chatgpt','codex','claude','claude-code','grok','muse','other')),
 label text NOT NULL, auth_method text NOT NULL CHECK(auth_method IN ('oauth','token')),
 scopes text[] NOT NULL CHECK(scopes <@ ARRAY['brain.read','brain.propose','offline_access']::text[] AND 'brain.read'=ANY(scopes)),
 oauth_client_id text REFERENCES oauth_clients(client_id), expires_at timestamptz NOT NULL,
 last_seen_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agent_tokens ADD COLUMN connection_id uuid REFERENCES ai_connections(id);
ALTER TABLE agent_tokens ADD COLUMN expires_at timestamptz;
ALTER TABLE agent_tokens ADD COLUMN resource text;
CREATE INDEX agent_tokens_connection ON agent_tokens(connection_id) WHERE connection_id IS NOT NULL;
CREATE INDEX ai_connections_workspace ON ai_connections(workspace_id,created_at DESC);
CREATE TABLE oauth_requests (
 request_hash text PRIMARY KEY, client_id text NOT NULL REFERENCES oauth_clients(client_id),
 redirect_uri text NOT NULL, code_challenge text NOT NULL, state text, scopes text[] NOT NULL,
 resource text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE oauth_codes (
 code_hash text PRIMARY KEY, connection_id uuid NOT NULL REFERENCES ai_connections(id), client_id text NOT NULL REFERENCES oauth_clients(client_id),
 redirect_uri text NOT NULL, code_challenge text NOT NULL, resource text NOT NULL,
 scopes text[] NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE oauth_refresh_tokens (
 token_hash text PRIMARY KEY, connection_id uuid NOT NULL REFERENCES ai_connections(id), client_id text NOT NULL REFERENCES oauth_clients(client_id),
 resource text NOT NULL, scopes text[] NOT NULL, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_requests_expiry ON oauth_requests(expires_at);
CREATE INDEX oauth_codes_expiry ON oauth_codes(expires_at);
CREATE INDEX oauth_refresh_connection ON oauth_refresh_tokens(connection_id);
