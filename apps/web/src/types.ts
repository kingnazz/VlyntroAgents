export type Agent = {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  role_description: string;
  agent_type: string;
  provider: string | null;
  model: string | null;
  status: string;
  current_task?: string;
  last_activity?: string;
  configuration: Record<string, unknown>;
  permissions?: {
    permission: string;
    workspace_id?: string;
    namespace_id?: string;
  }[];
  recent_messages?: Message[];
};
export type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  assigned_agent_id: string | null;
  workspace_id: string;
  channel_id: string | null;
  created_at: string;
  due_at: string | null;
  dependencies?: Task[];
  runs?: Run[];
  approvals?: Approval[];
  artifacts?: Artifact[];
  messages?: Message[];
  timeline?: Event[];
};
export type Run = {
  id: string;
  task_id: string | null;
  agent_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  output_summary: string;
  input_summary: string;
  error: string | null;
};
export type Approval = {
  id: string;
  task_id: string | null;
  run_id: string | null;
  requested_by_agent_id: string;
  title: string;
  description: string;
  approval_type: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
  review_comment: string | null;
};
export type Artifact = {
  id: string;
  name: string;
  artifact_type: string;
  content_text: string | null;
  created_at: string;
};
export type Message = {
  id: string;
  channel_id: string;
  body: string;
  sender_type: string;
  sender_name: string;
  sender_id: string;
  created_at: string;
  metadata: Record<string, unknown>;
};
export type Event = {
  id: string;
  action: string;
  actor_type: string;
  actor_id: string;
  created_at: string;
  payload: Record<string, unknown>;
};
export type Channel = {
  id: string;
  name: string;
  slug: string;
  description: string;
};
export type Workspace = { id: string; slug: string; name: string };
export type User = {
  id: string;
  display_name: string;
  role: string;
  email: string;
};
export type Health = {
  status: string;
  database: string;
  worker: { healthy: boolean };
};
export type Document = {
  key: string;
  value: unknown;
  version: number;
  updated_by: string;
  updated_at: string;
};
