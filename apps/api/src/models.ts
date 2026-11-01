import { z } from 'zod';
const id = z.uuid(),
  timestamp = z.iso.datetime(),
  object = z.record(z.string(), z.json());
const base = { id, created_at: timestamp };
const task = z
  .object({
    ...base,
    workspace_id: id,
    channel_id: id.nullable(),
    title: z.string(),
    description: z.string(),
    status: z.string(),
    priority: z.number().int(),
    created_by_type: z.string(),
    created_by_id: id,
    assigned_agent_id: id.nullable(),
    parent_task_id: id.nullable(),
    due_at: timestamp.nullable(),
    updated_at: timestamp,
    completed_at: timestamp.nullable(),
  })
  .passthrough();
const models = {
  User: z.object({
    id,
    email: z.email().optional(),
    display_name: z.string(),
    role: z.string(),
  }),
  Agent: z
    .object({
      ...base,
      slug: z.string(),
      display_name: z.string(),
      description: z.string(),
      role_description: z.string(),
      agent_type: z.enum(['llm', 'command', 'system']),
      provider: z.string().nullable(),
      model: z.string().nullable(),
      status: z.string(),
      system_prompt: z.string(),
      configuration: object,
      updated_at: timestamp,
    })
    .passthrough(),
  Workspace: z.object({
    ...base,
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    updated_at: timestamp,
  }),
  Channel: z.object({
    ...base,
    workspace_id: id,
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    channel_type: z.enum(['public', 'private', 'direct', 'system']),
    updated_at: timestamp,
  }),
  Message: z
    .object({
      ...base,
      workspace_id: id,
      channel_id: id,
      sender_type: z.enum(['user', 'agent', 'system']),
      sender_id: id.nullable(),
      message_type: z.string(),
      body: z.string(),
      metadata: object,
      reply_to_message_id: id.nullable(),
      edited_at: timestamp.nullable(),
    })
    .passthrough(),
  Task: task,
  Run: z.object({
    id,
    workspace_id: id,
    task_id: id.nullable(),
    job_id: id.nullable(),
    agent_id: id,
    status: z.string(),
    started_at: timestamp,
    completed_at: timestamp.nullable(),
    input_summary: z.string(),
    output_summary: z.string(),
    metadata: object,
    error: z.string().nullable(),
  }),
  RunStep: z.object({
    id,
    run_id: id,
    step_number: z.number().int(),
    step_type: z.string(),
    name: z.string(),
    status: z.string(),
    input: z.json().nullable(),
    output: z.json().nullable(),
    started_at: timestamp,
    completed_at: timestamp.nullable(),
    error: z.string().nullable(),
  }),
  Approval: z.object({
    ...base,
    workspace_id: id,
    task_id: id.nullable(),
    run_id: id.nullable(),
    requested_by_agent_id: id,
    approval_type: z.string(),
    title: z.string(),
    description: z.string(),
    payload: object,
    status: z.enum(['pending', 'approved', 'rejected', 'cancelled']),
    reviewed_by_user_id: id.nullable(),
    review_comment: z.string().nullable(),
    reviewed_at: timestamp.nullable(),
  }),
  Artifact: z
    .object({
      ...base,
      workspace_id: id,
      task_id: id.nullable(),
      run_id: id.nullable(),
      message_id: id.nullable(),
      created_by_type: z.string(),
      created_by_id: id,
      artifact_type: z.string(),
      name: z.string(),
      mime_type: z.string().nullable(),
      content_text: z.string().nullable(),
      metadata: object,
    })
    .passthrough(),
  Document: z.object({
    key: z.string(),
    value: z.json(),
    version: z.number().int().positive(),
    updated_by: z.string(),
    updated_at: timestamp,
  }),
  Namespace: z.object({
    id: z.string(),
    workspace_id: id,
    description: z.string(),
    created_at: timestamp,
  }),
  Event: z.object({
    id: z.union([z.string(), z.number()]),
    workspace_id: id.nullable(),
    namespace_id: z.string().nullable(),
    key: z.string().nullable(),
    action: z.string(),
    actor_type: z.string(),
    actor_id: z.string(),
    payload: object,
    created_at: timestamp,
  }),
  Health: z.object({
    status: z.enum(['healthy', 'degraded']),
    version: z.string(),
    database: z.string(),
    worker: z.object({
      last_seen_at: timestamp.nullable(),
      healthy: z.boolean(),
    }),
  }),
  Error: z.object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        current_version: z.number().int().nullable().optional(),
      })
      .passthrough(),
    request_id: z.string(),
  }),
};
export function toOpenapiSchema(
  schema: z.ZodType,
  name: string,
  io: 'input' | 'output' = 'output',
): Record<string, unknown> {
  function relocate(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(relocate);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          key === '$ref' && typeof entry === 'string' && entry.startsWith('#/')
            ? '#/components/schemas/' + name + entry.slice(1)
            : relocate(entry),
        ]),
      );
    return value;
  }
  return relocate(z.toJSONSchema(schema, { io })) as Record<string, unknown>;
}
export const modelSchemas: Record<
  string,
  Record<string, unknown>
> = Object.fromEntries(
  Object.entries(models).map(([key, schema]) => [
    key,
    toOpenapiSchema(schema, key),
  ]),
);
export function responseModel(
  url: string,
  method: string,
): Record<string, unknown> {
  const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
  const list = (name: string) => ({ type: 'array', items: ref(name) });
  if (url.endsWith('/health')) return ref('Health');
  if (url.endsWith('/login') || url.endsWith('/me')) return ref('User');
  if (url.endsWith('/logout'))
    return {
      type: 'object',
      properties: { ok: { const: true } },
      required: ['ok'],
    };
  if (url.includes('/state/') && url.endsWith(':key')) return ref('Document');
  if (url.includes('/state/'))
    return {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          version: { type: 'integer' },
          updated_by: { type: 'string' },
          updated_at: { type: 'string', format: 'date-time' },
        },
        required: ['key', 'version', 'updated_by', 'updated_at'],
      },
    };
  if (url.endsWith('/namespaces')) return list('Namespace');
  if (url.endsWith('/events')) return list('Event');
  if (url.endsWith('/steps')) return list('RunStep');
  if (url.endsWith('/messages'))
    return method === 'GET' ? list('Message') : ref('Message');
  if (url.endsWith('/channels')) return list('Channel');
  for (const [path, name] of [
    ['agents', 'Agent'],
    ['workspaces', 'Workspace'],
    ['tasks', 'Task'],
    ['runs', 'Run'],
    ['approvals', 'Approval'],
    ['artifacts', 'Artifact'],
  ])
    if (url.startsWith('/api/v1/' + path))
      return method === 'GET' && url === '/api/v1/' + path
        ? list(name)
        : ref(name);
  return { type: 'object', additionalProperties: true };
}
