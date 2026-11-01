import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { hash, argon2id } from 'argon2';
import { sql } from '../packages/db/src/client.js';
if (!process.env.DATABASE_URL?.includes('@127.0.0.1:55432/hq'))
  throw new Error(
    'This helper is restricted to the disposable local development database.',
  );
try {
  const password = randomBytes(32).toString('base64url');
  const passwordHash = await hash(password, { type: argon2id });
  await sql`UPDATE users SET password_hash=${passwordHash} WHERE email='local-owner@example.test'`;
  const env = await readFile('.env', 'utf8');
  await writeFile(
    '.env',
    env.replace(/^ADMIN_PASSWORD=.*$/m, 'ADMIN_PASSWORD=' + password),
    { mode: 0o600 },
  );
  console.info('Disposable local fixture rotated.');
} finally {
  await sql.end();
}
