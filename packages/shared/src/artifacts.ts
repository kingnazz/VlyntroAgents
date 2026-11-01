import { z } from 'zod';
import { sql } from '../../db/src/client.js';
import { type Actor, fail } from './contracts.js';
import { authorize, audit } from './security.js';
import { scopedRow } from './work.js';
export const artifactInput = z
  .object({
    workspace_id: z.uuid(),
    task_id: z.uuid().nullable().optional(),
    run_id: z.uuid().nullable().optional(),
    message_id: z.uuid().nullable().optional(),
    artifact_type: z.enum([
      'text',
      'file',
      'code',
      'image_reference',
      'link',
      'json',
    ]),
    name: z.string().trim().min(1).max(160),
    content_text: z.string().max(256000),
    metadata: z.record(z.string(), z.json()).default({}),
  })
  .strict();
export async function createArtifact(actor: Actor, input: unknown) {
  const data = artifactInput.parse(input);
  await authorize(sql, actor, 'workspace.write', {
    workspace: data.workspace_id,
  });
  if (data.task_id) {
    const task = await scopedRow(
      sql,
      actor,
      'tasks',
      data.task_id,
      'tasks.read',
    );
    if (task.workspace_id !== data.workspace_id)
      fail(422, 'workspace_mismatch', 'Task belongs to another workspace.');
  }
  if (data.run_id) {
    const run = await scopedRow(
      sql,
      actor,
      'runs',
      data.run_id,
      'workspace.read',
    );
    if (
      run.workspace_id !== data.workspace_id ||
      run.task_id !== (data.task_id ?? null)
    )
      fail(422, 'run_mismatch', 'Run does not match the artifact.');
  }
  if (data.message_id)
    fail(
      422,
      'unsupported_link',
      'Attach an artifact to its task or run in V1.',
    );
  if (['link', 'image_reference'].includes(data.artifact_type)) {
    const url = z.url().parse(data.content_text);
    if (!url.startsWith('https://'))
      fail(422, 'invalid_link', 'Only HTTPS references are supported.');
  }
  if (data.artifact_type === 'json')
    try {
      JSON.parse(data.content_text);
    } catch {
      fail(422, 'invalid_json', 'Artifact content must be valid JSON.');
    }
  return sql.begin(async (tx) => {
    const [artifact] =
      await tx`INSERT INTO artifacts(workspace_id,task_id,run_id,created_by_type,created_by_id,artifact_type,name,content_text,mime_type,metadata)
 VALUES(${data.workspace_id},${data.task_id ?? null},${data.run_id ?? null},${actor.type},${actor.id},${data.artifact_type},${data.name},${data.content_text},'text/plain',${tx.json(data.metadata)}) RETURNING *`;
    await audit(
      tx,
      actor,
      'artifact.created',
      { workspace: data.workspace_id },
      {
        artifact_id: artifact.id,
        task_id: data.task_id ?? null,
        run_id: data.run_id ?? null,
      },
    );
    return artifact;
  });
}
