import { it, expect, afterEach } from 'vitest';
import {
  mkdtemp,
  writeFile,
  chmod,
  mkdir,
  symlink,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isConfigured,
  runCommand,
  redactOutput,
} from '../packages/shared/src/providers.js';
const original = { ...process.env };
let root = '';
afterEach(async () => {
  for (const key of [
    'CODEX_ENABLED',
    'CODEX_COMMAND',
    'CODEX_WORKSPACE_ROOT',
    'CODEX_ARGS_JSON',
    'CODEX_TIMEOUT_MS',
    'ACCEPTANCE_API_KEY',
  ]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});
async function configure(script: string) {
  root = await mkdtemp(join(tmpdir(), 'hq-command-'));
  const executable = join(root, 'runner');
  await writeFile(executable, '#!/bin/sh\n' + script);
  await chmod(executable, 0o700);
  process.env.CODEX_ENABLED = 'true';
  process.env.CODEX_COMMAND = executable;
  process.env.CODEX_WORKSPACE_ROOT = root;
  process.env.CODEX_ARGS_JSON = '[]';
}
it('executes only the configured program with input through stdin', async () => {
  await configure('cat\n');
  const output = await runCommand('literal $(touch /should-not-exist)');
  expect(output.exit_code).toBe(0);
  expect(output.summary).toContain('literal $(touch /should-not-exist)');
});
it('rejects realpath traversal beyond the configured workspace', async () => {
  await configure('cat\n');
  await expect(runCommand('x', '../')).rejects.toThrow('outside');
});
it('rejects symlink escape from the workspace', async () => {
  await configure('cat\n');
  await mkdir(join(root, 'inside'));
  await symlink(tmpdir(), join(root, 'escape'));
  await expect(runCommand('x', 'escape')).rejects.toThrow('outside');
});
it('kills commands at the configured deadline', async () => {
  await configure('sleep 5\n');
  process.env.CODEX_TIMEOUT_MS = '50';
  await expect(runCommand('x')).rejects.toThrow('timed out');
});
it('caps excessive stdout without crashing the worker process', async () => {
  await configure('yes output\n');
  await expect(runCommand('x')).rejects.toThrow('output limit');
});
it('redacts known secrets before storing command output', () => {
  process.env.ACCEPTANCE_API_KEY = 'disposable-adapter-fixture';
  expect(redactOutput('x disposable-adapter-fixture y')).toBe('x [redacted] y');
});
it('keeps a missing command offline', async () => {
  process.env.CODEX_ENABLED = 'false';
  expect(
    await isConfigured({
      agent_type: 'command',
      slug: 'codex',
      provider: null,
      model: null,
      system_prompt: '',
    }),
  ).toBe(false);
});
