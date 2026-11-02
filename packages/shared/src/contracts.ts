import { z } from 'zod';
export const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const uuid = z.uuid();
export const taskStatuses = z.enum([
  'backlog',
  'queued',
  'running',
  'blocked',
  'needs_approval',
  'completed',
  'failed',
  'cancelled',
]);
export const jsonObject = z.record(z.string(), z.json());
export const stateWrite = z
  .object({
    value: z.json(),
    expected_version: z.number().int().positive().nullable(),
  })
  .strict();
export const messageInput = z
  .object({
    body: z.string().trim().min(1).max(12000),
    idempotency_key: z.uuid(),
  })
  .strict();
export const taskInput = z
  .object({
    workspace_id: uuid,
    channel_id: uuid.nullable().optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(12000).default(''),
    assigned_agent_id: uuid.nullable().optional(),
    priority: z.number().int().min(0).max(4).default(2),
    parent_task_id: uuid.nullable().optional(),
    due_at: z.iso.datetime().nullable().optional(),
    dependencies: z.array(uuid).max(20).default([]),
  })
  .strict();
export const taskPatch = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(12000).optional(),
    status: taskStatuses.optional(),
    priority: z.number().int().min(0).max(4).optional(),
    assigned_agent_id: uuid.nullable().optional(),
    due_at: z.iso.datetime().nullable().optional(),
  })
  .strict();
export const approvalInput = z
  .object({
    workspace_id: uuid,
    task_id: uuid.nullable().optional(),
    run_id: uuid.nullable().optional(),
    requested_by_agent_id: uuid.optional(),
    approval_type: z.enum(['content.publish', 'action.review']),
    title: z.string().min(1).max(200),
    description: z.string().max(4000).default(''),
    payload: jsonObject,
  })
  .strict();
export const contentPost = z
  .object({
    id: identifier,
    status: z.enum(['idea', 'drafted', 'in_review', 'approved', 'published']),
    caption: z.string().max(8000),
    hooks: z.array(z.string().max(500)).max(10),
    media_refs: z.array(z.string().max(2000)).max(20),
    review_notes: z.string().max(4000),
    scheduled_for: z.iso.datetime().nullable(),
    published_url: z.url().nullable(),
    metrics: jsonObject,
  })
  .strict();
export const pipelineSchema = z
  .object({ posts: z.array(contentPost).max(500) })
  .strict();
export type ContentPost = z.infer<typeof contentPost>;
export type Actor = {
  type: 'user' | 'agent' | 'system';
  id: string;
  role?: string;
  slug?: string;
  tokenId?: string;
  sessionId?: string;
  connectionId?: string;
  oauthResource?: string;
};
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
export function fail(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  throw new AppError(status, code, message, details);
}
