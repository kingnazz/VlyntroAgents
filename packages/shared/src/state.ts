import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sql, type Query } from '../../db/src/client.js';
import {
  type Actor,
  type ContentPost,
  fail,
  pipelineSchema,
  stateWrite,
} from './contracts.js';
import { audit, authorize } from './security.js';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export const postHash = (post: ContentPost) =>
  createHash('sha256')
    .update(
      canonical({
        ...post,
        status: undefined,
        published_url: null,
        metrics: {},
      }),
    )
    .digest('hex');
export async function namespaceInfo(db: Query, namespace: string) {
  const [ns] = await db`SELECT * FROM namespaces WHERE id=${namespace}`;
  return ns ?? fail(404, 'not_found', 'Namespace not found.');
}
export async function readState(actor: Actor, namespace: string, key: string) {
  const ns = await namespaceInfo(sql, namespace);
  await authorize(sql, actor, 'documents.read', { namespace });
  const [doc] =
    await sql`SELECT key,value,version,updated_by,updated_at FROM documents WHERE namespace_id=${ns.id} AND key=${key}`;
  return doc ?? fail(404, 'not_found', 'Document not found.');
}
export async function enforceStatePolicy(
  db: Query,
  actor: Actor,
  namespace: string,
  key: string,
  value: unknown,
  previous: unknown,
) {
  if (namespace !== 'vlyntro-ig') return;
  const owner = actor.type === 'user' && actor.role === 'owner';
  const muse = actor.type === 'agent' && actor.slug === 'muse';
  const creator = actor.type === 'agent' && actor.slug === 'chatgpt';
  if (key === 'brand_bible') {
    if (!owner && !muse)
      fail(
        403,
        'locked_document',
        'Only Muse or the owner may change the brand bible.',
      );
    z.object({
      voice: z.array(z.string()).min(1),
      minimal_hashtags: z.literal(true),
      no_em_dashes: z.literal(true),
      real_captures_only: z.literal(true),
      human_approval_required: z.literal(true),
    })
      .strict()
      .parse(value);
  }
  if (key === 'weekly_brief') {
    if (!owner && !creator)
      fail(
        403,
        'forbidden',
        'Only ChatGPT or the owner may write the weekly brief.',
      );
    z.object({
      week_of: z.iso.date().nullable(),
      theme: z.string().max(1000),
      n_posts: z.number().int().min(0).max(30),
      notes: z.string().max(8000),
    })
      .strict()
      .parse(value);
  }
  if (key === 'performance_log') {
    if (!owner && !muse)
      fail(403, 'forbidden', 'Only Muse or the owner may add performance.');
    const schema = z
      .object({
        entries: z
          .array(
            z
              .object({
                post_id: z.string(),
                impressions: z.number().int().nonnegative(),
                likes: z.number().int().nonnegative(),
                comments: z.number().int().nonnegative(),
                saves: z.number().int().nonnegative(),
                notes: z.string().max(4000),
                recorded_at: z.iso.datetime(),
              })
              .strict(),
          )
          .max(3000),
      })
      .strict();
    const next = schema.parse(value),
      old = schema.parse(previous ?? { entries: [] });
    if (
      canonical(next.entries.slice(0, old.entries.length)) !==
      canonical(old.entries)
    )
      fail(
        403,
        'append_only',
        'Existing performance entries cannot be changed.',
      );
  }
  if (key === 'pipeline') {
    if (!owner && !muse && !creator)
      fail(
        403,
        'forbidden',
        'This agent cannot change the Instagram pipeline.',
      );
    const next = pipelineSchema.parse(value),
      old = pipelineSchema.parse(previous ?? { posts: [] });
    if (new Set(next.posts.map((p) => p.id)).size !== next.posts.length)
      fail(422, 'duplicate_post', 'Post IDs must be unique.');
    for (const prior of old.posts)
      if (!next.posts.some((p) => p.id === prior.id))
        fail(403, 'immutable_history', 'Content records cannot be deleted.');
    for (const post of next.posts) {
      const prior = old.posts.find((p) => p.id === post.id);
      if (prior && canonical(prior) === canonical(post)) continue;
      if (
        creator &&
        (!['idea', 'drafted'].includes(post.status) ||
          (prior && !['idea', 'drafted'].includes(prior.status)))
      )
        fail(
          403,
          'invalid_transition',
          'ChatGPT may change ideas and drafts only.',
        );
      if (muse && !['drafted', 'in_review', 'published'].includes(post.status))
        fail(
          403,
          'invalid_transition',
          'Muse may review drafts or record approved publication.',
        );
      if (post.status === 'approved')
        fail(
          403,
          'approval_required',
          'Approve the exact content through the human approval inbox.',
        );
      if (prior?.status === 'published')
        fail(
          403,
          'immutable_history',
          'Published content is immutable. Add metrics through performance_log.',
        );
      if (prior?.status === 'approved' && post.status !== 'published')
        fail(
          403,
          'immutable_approval',
          'Approved content cannot be rewritten.',
        );
      if (post.status === 'published') {
        if (
          !muse ||
          prior?.status !== 'approved' ||
          postHash(prior) !== postHash(post) ||
          !post.published_url?.startsWith('https://')
        )
          fail(
            403,
            'approval_required',
            'Muse may record publication of unchanged human-approved content with an HTTPS URL.',
          );
        const ns = await namespaceInfo(db, namespace);
        await authorize(db, actor, 'publish', { workspace: ns.workspace_id });
      }
      if (
        muse &&
        prior &&
        post.status === 'in_review' &&
        !['drafted', 'in_review'].includes(prior.status)
      )
        fail(403, 'invalid_transition', 'Review requires a drafted record.');
      if (!prior && ['in_review', 'published'].includes(post.status))
        fail(
          403,
          'invalid_transition',
          'New content must start as an idea or draft.',
        );
    }
  }
}
export async function writeState(
  actor: Actor,
  namespace: string,
  key: string,
  input: unknown,
) {
  const { value, expected_version } = stateWrite.parse(input);
  return sql.begin(async (tx) => {
    const ns = await namespaceInfo(tx, namespace);
    await authorize(tx, actor, 'documents.write', { namespace });
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${namespace + ':' + key},0))`;
    const [old] =
      await tx`SELECT * FROM documents WHERE namespace_id=${namespace} AND key=${key} FOR UPDATE`;
    if (
      (old && expected_version !== old.version) ||
      (!old && expected_version !== null)
    )
      fail(
        409,
        'version_conflict',
        'The document changed. Read the current version and retry.',
        { current_version: old?.version ?? null },
      );
    await enforceStatePolicy(tx, actor, namespace, key, value, old?.value);
    const [doc] =
      await tx`INSERT INTO documents(namespace_id,key,value,version,updated_by)
   VALUES(${namespace},${key},${tx.json(value as never)},1,${actor.type + ':' + (actor.slug ?? actor.id)})
   ON CONFLICT(namespace_id,key) DO UPDATE SET value=excluded.value,version=documents.version+1,updated_by=excluded.updated_by,updated_at=now()
   RETURNING key,value,version,updated_by,updated_at`;
    await audit(
      tx,
      actor,
      'document.updated',
      { workspace: ns.workspace_id, namespace, key },
      { version: doc.version },
    );
    return doc;
  });
}
