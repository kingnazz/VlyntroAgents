export type Guide = {
  kind: string;
  name: string;
  mcp_url: string;
  home: string;
  docs: string;
  steps: string[];
  command: string | null;
  setup_prompt: string;
  skill_url: string;
  plugin_url: string;
};
export type Connection = {
  id: string;
  label: string;
  client_kind: string;
  auth_method: 'oauth' | 'token';
  scopes: string[];
  expires_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
};
