import EmbeddedPostgres from 'embedded-postgres';
import { mkdir } from 'node:fs/promises';
const directory = process.env.LOCAL_PG_DIR ?? '/tmp/vlyntro-hq-postgres';
await mkdir(directory, { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: 'hq',
  password: 'local-development-only',
  port: 55432,
  persistent: true,
  onLog: () => {},
  onError: () => {},
});
try {
  await pg.initialise();
} catch {
  /* Existing development cluster. */
}
await pg.start();
try {
  await pg.createDatabase('hq');
} catch {
  /* Database already exists. */
}
console.info('Development PostgreSQL listening on 127.0.0.1:55432');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
await new Promise(() => {});
