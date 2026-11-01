import { sql } from '../../../packages/db/src/client.js';
import {
  type Actor,
  AppError,
} from '../../../packages/shared/src/contracts.js';
import {
  audit,
  authorize,
  safeText,
} from '../../../packages/shared/src/security.js';
import { writeState } from '../../../packages/shared/src/state.js';
import { postMessage } from '../../../packages/shared/src/work.js';
import { requestApproval } from '../../../packages/shared/src/approvals.js';
import {
  generate,
  runCommand,
  ExecutionError,
  type AgentConfig,
  redactOutput,
} from '../../../packages/shared/src/providers.js';
import { retryDelay } from './queue.js';
type Job = {
  id: string;
  workspace_id: string;
  task_id: string | null;
  agent_id: string;
  attempts: number;
  max_attempts: number;
  root_id: string | null;
  payload: {
    instruction?: string;
    channel_id?: string;
    depth?: number;
    approval_id?: string;
  };
};
export async function executeJob(job: Job, provider = generate) {
  const [agentRow] = await sql`SELECT * FROM agents WHERE id=${job.agent_id}`;
  const agent = agentRow as unknown as AgentConfig;
  const actor: Actor = { type: 'agent', id: job.agent_id, slug: agent.slug };
  const [run] =
    await sql`INSERT INTO runs(workspace_id,task_id,job_id,agent_id,status,input_summary) VALUES(${job.workspace_id},${job.task_id},${job.id},${job.agent_id},'running',${'Bounded workspace, task, recent messages and authorized Blackboard context. Attempt ' + job.attempts}) RETURNING id`;
  let step = 0;
  async function record(name: string, status = 'completed', summary = '') {
    await sql`INSERT INTO run_steps(run_id,step_number,step_type,name,status,output,completed_at) VALUES(${run.id},${++step},'action',${name},${status},${sql.json({ summary })},now())`;
  }
  try {
    await sql`UPDATE agents SET status='busy',updated_at=now() WHERE id=${job.agent_id} AND status<>'disabled'`;
    if (job.task_id)
      await sql`UPDATE tasks SET status='running',updated_at=now() WHERE id=${job.task_id} AND status NOT IN ('needs_approval','blocked','cancelled')`;
    await audit(
      sql,
      actor,
      'job.started',
      { workspace: job.workspace_id },
      { job_id: job.id, run_id: run.id, task_id: job.task_id },
    );
    await audit(
      sql,
      actor,
      'agent.status',
      { workspace: job.workspace_id },
      { agent_id: job.agent_id, status: 'busy' },
    );
    const [workspace] =
      await sql`SELECT name,description FROM workspaces WHERE id=${job.workspace_id}`;
    const [task] = job.task_id
      ? await sql`SELECT title,description FROM tasks WHERE id=${job.task_id}`
      : [];
    const messages = job.payload.channel_id
      ? await sql`SELECT sender_type,body,created_at FROM messages WHERE channel_id=${job.payload.channel_id} ORDER BY created_at DESC LIMIT 20`
      : [];
    const documents =
      await sql`SELECT d.namespace_id,d.key,d.value,d.version FROM documents d JOIN namespaces n ON n.id=d.namespace_id WHERE n.workspace_id=${job.workspace_id} AND d.key IN ('brand_bible','pipeline','performance_log','weekly_brief') AND EXISTS(SELECT 1 FROM agent_permissions p WHERE p.agent_id=${job.agent_id} AND p.namespace_id=d.namespace_id AND p.permission='documents.read')`;
    const boundedDocs = documents.map((d) =>
      JSON.stringify(d).length < 16000
        ? d
        : {
            namespace_id: d.namespace_id,
            key: d.key,
            version: d.version,
            note: 'Document exceeds bounded context. Read and edit through MCP with version checking.',
          },
    );
    const approvals = job.task_id
      ? await sql`SELECT id,status,approval_type,title FROM approvals WHERE task_id=${job.task_id} ORDER BY created_at DESC LIMIT 5`
      : [];
    await record(
      'Load bounded context',
      'completed',
      `${messages.length} recent messages, ${documents.length} authorized documents, ${approvals.length} approval records.`,
    );
    if (job.payload.approval_id) {
      const [approval] =
        await sql`SELECT status FROM approvals WHERE id=${job.payload.approval_id} AND workspace_id=${job.workspace_id} AND task_id=${job.task_id}`;
      if (approval?.status !== 'approved')
        throw new ExecutionError('Approval is no longer authorized.', true);
    }
    let summary: string,
      waiting = false;
    if (agent.agent_type === 'command') {
      await authorize(sql, actor, 'tasks.write', {
        workspace: job.workspace_id,
      });
      const result = await runCommand(
        job.payload.instruction ?? task?.description ?? '',
      );
      await record(
        'Execute configured command',
        result.exit_code === 0 ? 'completed' : 'failed',
        `Exit code ${result.exit_code}. ${result.summary.slice(0, 2000)}`,
      );
      if (result.exit_code !== 0)
        throw new ExecutionError(
          `Command exited with code ${result.exit_code}.`,
          true,
        );
      summary = result.summary;
    } else {
      const output = await provider(agent, {
        workspace,
        task,
        instruction: job.payload.instruction,
        messages: messages
          .reverse()
          .map((m) => ({ ...m, body: m.body.slice(0, 2000) })),
        blackboard: boundedDocs,
        approvals,
      });
      await record(
        'Generate structured agent response',
        'completed',
        'Validated response and requested actions.',
      );
      for (const write of output.state_writes) {
        await writeState(actor, write.namespace, write.key, {
          value: write.value,
          expected_version: write.expected_version,
        });
        await record(
          'Update Blackboard',
          'completed',
          write.namespace + '/' + write.key,
        );
      }
      if (output.approval) {
        await requestApproval(actor, {
          ...output.approval,
          workspace_id: job.workspace_id,
          task_id: job.task_id,
          run_id: run.id,
        });
        waiting = true;
        await record('Request human approval');
      }
      summary = redactOutput(safeText(output.message));
    }
    if (job.payload.channel_id) {
      await postMessage(
        actor,
        job.payload.channel_id,
        { body: summary || 'Command completed.', idempotency_key: job.id },
        {
          rootId: job.root_id ?? undefined,
          depth: job.payload.depth ?? 0,
          taskId: job.task_id ?? undefined,
          runId: run.id,
        },
      );
      await record('Post channel response');
    }
    await sql.begin(async (tx) => {
      await tx`UPDATE jobs SET status='completed',result=${tx.json({ summary: summary.slice(0, 4000), run_id: run.id })},completed_at=now(),updated_at=now() WHERE id=${job.id}`;
      await tx`UPDATE runs SET status='completed',output_summary=${summary.slice(0, 4000)},completed_at=now() WHERE id=${run.id}`;
      if (job.task_id && !waiting) {
        const [remaining] =
          await tx`SELECT 1 FROM jobs WHERE task_id=${job.task_id} AND id<>${job.id} AND status IN ('queued','running','claimed','waiting')`;
        if (!remaining)
          await tx`UPDATE tasks SET status='completed',completed_at=now(),updated_at=now() WHERE id=${job.task_id} AND status NOT IN ('needs_approval','blocked','cancelled')`;
      }
      await audit(
        tx,
        actor,
        'job.completed',
        { workspace: job.workspace_id },
        { job_id: job.id, run_id: run.id, task_id: job.task_id },
      );
    });
  } catch (error) {
    const permanent =
      (error instanceof ExecutionError && error.permanent) ||
      (error instanceof AppError && error.status < 500) ||
      error instanceof SyntaxError;
    const retry = !permanent && job.attempts < job.max_attempts;
    const message =
      error instanceof ExecutionError || error instanceof AppError
        ? error.message
        : 'Agent execution failed. Inspect configuration and retry policy.';
    await record('Execution failed', 'failed', message);
    await sql.begin(async (tx) => {
      await tx`UPDATE jobs SET status=${retry ? 'queued' : 'failed'},last_error=${message},available_at=now()+${retryDelay(job.attempts)}*interval '1 second',updated_at=now(),completed_at=${retry ? null : new Date()} WHERE id=${job.id}`;
      await tx`UPDATE runs SET status='failed',error=${message},completed_at=now() WHERE id=${run.id}`;
      if (job.task_id)
        await tx`UPDATE tasks SET status=${retry ? 'queued' : 'failed'},updated_at=now() WHERE id=${job.task_id} AND status NOT IN ('needs_approval','blocked','cancelled')`;
      await tx`UPDATE agents SET status='error',updated_at=now() WHERE id=${job.agent_id} AND status<>'disabled'`;
      await audit(
        tx,
        actor,
        'job.failed',
        { workspace: job.workspace_id },
        {
          job_id: job.id,
          run_id: run.id,
          task_id: job.task_id,
          retry,
          error: message,
        },
      );
    });
  } finally {
    await sql`UPDATE agents SET status='idle',updated_at=now() WHERE id=${job.agent_id} AND status='busy'`;
  }
}
