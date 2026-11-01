import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sql } from './client.js';
export async function migrate() {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(4738291)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
    for (const name of (await readdir(directory))
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const contents = await readFile(`${directory}/${name}`, 'utf8');
      const checksum = createHash('sha256').update(contents).digest('hex');
      const [existing] =
        await tx`SELECT checksum FROM schema_migrations WHERE name=${name}`;
      if (existing && existing.checksum !== checksum)
        throw new Error(`Migration checksum mismatch: ${name}`);
      if (!existing) {
        await tx.unsafe(contents);
        await tx`INSERT INTO schema_migrations (name,checksum) VALUES (${name},${checksum})`;
        console.info(`Applied ${name}`);
      }
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await migrate();
  } finally {
    await sql.end();
  }
}
