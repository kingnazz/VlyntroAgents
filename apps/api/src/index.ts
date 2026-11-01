import { buildApp } from './app.js';
import { sql } from '../../../packages/db/src/client.js';
const app = await buildApp(true);
await app.listen({
  host: process.env.API_HOST ?? '0.0.0.0',
  port: Number(process.env.API_PORT ?? 4000),
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, async () => {
    await app.close();
    await sql.end();
    process.exit(0);
  });
