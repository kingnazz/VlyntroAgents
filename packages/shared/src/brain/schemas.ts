import { z } from 'zod';
import { uuid, jsonObject } from '../contracts.js';
export const brainKind = z.enum([
  'note',
  'fact',
  'observation',
  'decision',
  'preference',
  'idea',
  'reference',
]);
export const importance = z.enum(['low', 'normal', 'high', 'critical']);
export const targetType = z.enum([
  'project',
  'person',
  'organization',
  'task',
  'message',
  'run',
  'artifact',
  'approval',
  'channel',
]);
export const entityType = z.enum(['project', 'person', 'organization']);
export const linkInput = z
  .object({
    target_type: targetType,
    target_id: uuid,
    relation: z
      .enum(['ABOUT', 'SOURCE', 'SUPPORTS', 'FOLLOW_UP', 'RESULT'])
      .default('ABOUT'),
  })
  .strict();
export const itemInput = z
  .object({
    workspace_id: uuid,
    kind: brainKind.default('note'),
    title: z.string().trim().min(1).max(240),
    body: z.string().min(1).max(16000),
    summary: z.string().max(2000).nullable().optional(),
    status: z.enum(['active', 'proposed']).optional(),
    importance: importance.default('normal'),
    confidence: z.number().min(0).max(1).nullable().optional(),
    occurred_at: z.iso.datetime().nullable().optional(),
    valid_from: z.iso.datetime().nullable().optional(),
    valid_until: z.iso.datetime().nullable().optional(),
    source_type: z
      .enum([
        'manual',
        'capture',
        'message',
        'task',
        'run',
        'artifact',
        'approval',
        'channel',
        'agent',
      ])
      .default('manual'),
    source_id: uuid.nullable().optional(),
    links: z.array(linkInput).max(30).default([]),
    metadata: jsonObject.default({}),
  })
  .strict();
export const itemPatch = itemInput
  .pick({
    kind: true,
    title: true,
    body: true,
    summary: true,
    importance: true,
    confidence: true,
    occurred_at: true,
    valid_from: true,
    valid_until: true,
    metadata: true,
  })
  .partial()
  .extend({
    kind: brainKind.optional(),
    importance: importance.optional(),
    metadata: jsonObject.optional(),
    expected_revision: z.number().int().positive(),
    change_reason: z.string().max(1000).optional(),
    links: z.array(linkInput).max(30).optional(),
  })
  .strict();
export const searchInput = z
  .object({
    workspace_id: uuid,
    q: z.string().max(500).default(''),
    kind: brainKind.optional(),
    project_id: uuid.optional(),
    person_id: uuid.optional(),
    organization_id: uuid.optional(),
    importance: importance.optional(),
    status: z.enum(['active', 'proposed', 'superseded', 'archived']).optional(),
    source_type: z.string().max(40).optional(),
    since: z.iso.datetime().optional(),
    until: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(40),
    cursor: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();
export const captureInput = z
  .object({
    workspace_id: uuid,
    raw_text: z.string().min(1).max(16000),
    idempotency_key: uuid,
  })
  .strict();
const optionalText = z.string().trim().min(1).max(2000).nullable().optional();
export const projectInput = z
  .object({
    workspace_id: uuid,
    name: z.string().trim().min(1).max(240),
    slug: z.string().max(100).nullable().optional(),
    description: optionalText,
    summary: optionalText,
    status: z
      .enum(['idea', 'active', 'paused', 'completed', 'archived'])
      .default('active'),
    owner_user_id: uuid.nullable().optional(),
    started_at: z.iso.datetime().nullable().optional(),
    completed_at: z.iso.datetime().nullable().optional(),
    metadata: jsonObject.default({}),
  })
  .strict();
export const personInput = z
  .object({
    workspace_id: uuid,
    display_name: z.string().trim().min(1).max(240),
    first_name: optionalText,
    last_name: optionalText,
    email: z.email().max(254).nullable().optional(),
    phone: optionalText,
    title: optionalText,
    organization_name: optionalText,
    notes: optionalText,
    metadata: jsonObject.default({}),
  })
  .strict();
export const organizationInput = z
  .object({
    workspace_id: uuid,
    name: z.string().trim().min(1).max(240),
    domain: z
      .string()
      .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i)
      .max(254)
      .nullable()
      .optional(),
    description: optionalText,
    metadata: jsonObject.default({}),
  })
  .strict();
export const entityLinkInput = z
  .object({
    workspace_id: uuid,
    from_type: z.enum(['project', 'person', 'organization', 'task']),
    from_id: uuid,
    to_type: z.enum(['project', 'person', 'organization', 'task']),
    to_id: uuid,
    relation: z.enum(['WORKS_AT', 'RELATED_TO', 'DEPENDS_ON', 'FOLLOW_UP']),
  })
  .strict();
export const brainProposal = itemInput
  .pick({ kind: true, title: true, body: true, importance: true })
  .extend({
    project_refs: z.array(uuid).max(5).default([]),
    person_refs: z.array(uuid).max(5).default([]),
  })
  .strict();
// Literal evidence is required. Unsupported values are rejected before persistence.
const evidence = z.string().min(1).max(2000);
export const extractionSchema = z
  .object({
    people: z
      .array(
        z
          .object({
            display_name: z.string().min(1).max(240),
            email: z.email().nullable().default(null),
            organization_name: z.string().max(240).nullable().default(null),
            evidence,
          })
          .strict(),
      )
      .max(10)
      .default([]),
    organizations: z
      .array(
        z
          .object({
            name: z.string().min(1).max(240),
            domain: z.string().nullable().default(null),
            evidence,
          })
          .strict(),
      )
      .max(10)
      .default([]),
    projects: z
      .array(
        z
          .object({
            name: z.string().min(1).max(240),
            description: z.string().max(2000).nullable().default(null),
            evidence,
          })
          .strict(),
      )
      .max(10)
      .default([]),
    memories: z
      .array(
        z
          .object({
            kind: brainKind,
            title: z.string().min(1).max(240),
            body: z.string().min(1).max(4000),
            evidence,
            project_names: z.array(z.string()).max(5).default([]),
            person_names: z.array(z.string()).max(5).default([]),
            organization_names: z.array(z.string()).max(5).default([]),
          })
          .strict(),
      )
      .max(15)
      .default([]),
    follow_ups: z
      .array(
        z
          .object({
            title: z.string().min(1).max(200),
            timing_phrase: z.string().max(200).nullable().default(null),
            due_at: z.iso.datetime().nullable().default(null),
            evidence,
          })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict();
export type Extraction = z.infer<typeof extractionSchema>;
export type EntityType = z.infer<typeof entityType>;
export const entityTables = {
  project: 'projects',
  person: 'people',
  organization: 'organizations',
} as const;
export const entitySchemas = {
  project: projectInput,
  person: personInput,
  organization: organizationInput,
};
export const entityPatchSchemas = {
  project: projectInput
    .omit({ workspace_id: true })
    .partial()
    .extend({
      status: z
        .enum(['idea', 'active', 'paused', 'completed', 'archived'])
        .optional(),
      metadata: jsonObject.optional(),
    }),
  person: personInput
    .omit({ workspace_id: true })
    .partial()
    .extend({ metadata: jsonObject.optional() }),
  organization: organizationInput
    .omit({ workspace_id: true })
    .partial()
    .extend({ metadata: jsonObject.optional() }),
};
