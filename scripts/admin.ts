import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { hash, argon2id } from 'argon2';
import { z } from 'zod';
import { sql } from '../packages/db/src/client.js';
import { audit } from '../packages/shared/src/security.js';
async function hiddenPassword(): Promise<string> {
  if (!stdin.isTTY)
    throw new Error('Non-interactive bootstrap requires ADMIN_PASSWORD.');
  stdout.write('Password (minimum 14 characters): ');
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let password = '';
    const handler = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Cancelled'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(password);
          return;
        }
        if (char === '\u007f') password = password.slice(0, -1);
        else password += char;
      }
    };
    const cleanup = () => {
      stdin.off('data', handler);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    stdin.on('data', handler);
  });
}
try {
  const prompt = createInterface({ input: stdin, output: stdout });
  const email = z
    .email()
    .parse(process.env.ADMIN_EMAIL ?? (await prompt.question('Email: ')))
    .toLowerCase();
  const name = z
    .string()
    .trim()
    .min(1)
    .max(100)
    .parse(
      process.env.ADMIN_DISPLAY_NAME ??
        (await prompt.question('Display name: ')),
    );
  prompt.close();
  const password = z
    .string()
    .min(14)
    .max(256)
    .parse(process.env.ADMIN_PASSWORD ?? (await hiddenPassword()));
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  await sql.begin(async (tx) => {
    const [user] =
      await tx`INSERT INTO users(email,display_name,password_hash,role) VALUES(${email},${name},${passwordHash},'owner') RETURNING id`;
    await audit(
      tx,
      { type: 'user', id: user.id, role: 'owner' },
      'auth.owner_created',
      {},
      {},
    );
  });
  console.info('Owner created. No password was logged.');
} catch {
  console.error(
    'Owner creation failed. Check inputs, database connectivity and whether the email exists.',
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
