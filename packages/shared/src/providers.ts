import { access, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { isAbsolute, resolve, relative } from 'node:path';
import { z } from 'zod';
export class ExecutionError extends Error {
  constructor(
    message: string,
    public permanent = false,
  ) {
    super(message);
  }
}
export const agentOutput = z
  .object({
    message: z.string().min(1).max(12000),
    state_writes: z
      .array(
        z
          .object({
            namespace: z.string(),
            key: z.string(),
            value: z.json(),
            expected_version: z.number().int().positive().nullable(),
          })
          .strict(),
      )
      .max(6)
      .default([]),
    approval: z
      .object({
        approval_type: z.enum(['content.publish', 'action.review']),
        title: z.string().max(200),
        description: z.string().max(4000),
        payload: z.record(z.string(), z.json()),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export type AgentOutput = z.infer<typeof agentOutput>;
export type AgentConfig = {
  agent_type: string;
  provider: string | null;
  model: string | null;
  system_prompt: string;
  slug: string;
};
const keyNames: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  xai: 'XAI_API_KEY',
};
export function redactOutput(text: string) {
  let safe = text;
  for (const [name, value] of Object.entries(process.env))
    if (
      /KEY|SECRET|PASSWORD|TOKEN|DATABASE_URL/.test(name) &&
      value &&
      value.length >= 8
    )
      safe = safe.split(value).join('[redacted]');
  return safe
    .split(String.fromCharCode(27))
    .join('')
    .replace(/\u2014/g, ',')
    .slice(0, 64000);
}
async function commandPath() {
  const command = process.env.CODEX_COMMAND;
  if (
    process.env.CODEX_ENABLED !== 'true' ||
    !command ||
    !isAbsolute(command) ||
    !process.env.CODEX_WORKSPACE_ROOT
  )
    return null;
  try {
    await access(command, constants.X_OK);
    await realpath(process.env.CODEX_WORKSPACE_ROOT);
    return command;
  } catch {
    return null;
  }
}
export async function isConfigured(agent: AgentConfig) {
  return (
    agent.agent_type === 'system' ||
    (agent.agent_type === 'command'
      ? !!(await commandPath())
      : !!process.env[keyNames[agent.provider ?? '']])
  );
}
export async function runCommand(
  instruction: string,
  subdirectory = '',
): Promise<{ exit_code: number; summary: string }> {
  const command = await commandPath();
  if (!command)
    throw new ExecutionError('Command agent is not configured.', true);
  const root = await realpath(process.env.CODEX_WORKSPACE_ROOT!);
  const cwd = await realpath(resolve(root, subdirectory));
  const rel = relative(root, cwd);
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new ExecutionError(
      'Workspace path is outside the configured root.',
      true,
    );
  let args: string[];
  try {
    args = z
      .array(z.string().max(1000))
      .max(30)
      .parse(JSON.parse(process.env.CODEX_ARGS_JSON ?? '[]'));
  } catch {
    throw new ExecutionError('Invalid configured command arguments.', true);
  }
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      detached: true,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.CODEX_HOME_DIR ?? '/tmp/codex-home',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        NODE_ENV: 'production',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '',
      bytes = 0,
      stopped = false;
    const stop = () => {
      if (child.pid)
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* Process already exited. */
        }
    };
    const timer = setTimeout(
      () => {
        stopped = true;
        stop();
      },
      Math.min(Number(process.env.CODEX_TIMEOUT_MS) || 90000, 120000),
    );
    const capture = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 64000) {
        stopped = true;
        stop();
      } else output += chunk.toString('utf8');
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', () => {
      clearTimeout(timer);
      reject(
        new ExecutionError('Configured executable could not start.', true),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (stopped)
        reject(
          new ExecutionError(
            'Command timed out or exceeded the output limit.',
            true,
          ),
        );
      else
        resolveResult({ exit_code: code ?? 1, summary: redactOutput(output) });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(instruction.slice(0, 16000));
  });
}
export async function generate(
  agent: AgentConfig,
  context: unknown,
): Promise<AgentOutput> {
  const key = process.env[keyNames[agent.provider ?? '']];
  if (!key)
    throw new ExecutionError(
      'Provider key is missing. Configure this agent on the server.',
      true,
    );
  const contract =
    'Return only a JSON object with message (string), state_writes (array of {namespace,key,value,expected_version}), and approval (null or {approval_type: content.publish or action.review,title,description,payload}). Read current versions before writes. No hidden reasoning. Mention @Muse to hand drafts over. Muse should request content.publish with payload {post_id} only after moving content into in_review. Never create an approval for already approved content. Do not claim to publish externally. If credentials or media are unavailable, say so. A mention creates another job, so use it only for an explicit handoff.';
  const system = agent.system_prompt + '\n' + contract;
  const user = JSON.stringify(context);
  const anthropic = agent.provider === 'anthropic';
  const url = anthropic
    ? 'https://api.anthropic.com/v1/messages'
    : agent.provider === 'xai'
      ? 'https://api.x.ai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(60000),
    headers: anthropic
      ? {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        }
      : { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify(
      anthropic
        ? {
            model: agent.model,
            max_tokens: 4000,
            system,
            messages: [{ role: 'user', content: user }],
          }
        : {
            model: agent.model,
            max_completion_tokens: 4000,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          },
    ),
  });
  if (!response.ok)
    throw new ExecutionError(
      `Provider request failed (HTTP ${response.status}).`,
      response.status >= 400 &&
        response.status < 500 &&
        ![408, 429].includes(response.status),
    );
  const raw: unknown = await response.json();
  const responseSchema = anthropic
    ? z.object({
        content: z.array(
          z.object({ type: z.string(), text: z.string().optional() }),
        ),
      })
    : z.object({
        choices: z.array(
          z.object({ message: z.object({ content: z.string().nullable() }) }),
        ),
      });
  const data = responseSchema.parse(raw);
  const text =
    'content' in data
      ? data.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('')
      : (data.choices[0]?.message.content ?? '');
  try {
    return agentOutput.parse(
      JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')),
    );
  } catch {
    throw new ExecutionError('Provider returned invalid structured output.');
  }
}
