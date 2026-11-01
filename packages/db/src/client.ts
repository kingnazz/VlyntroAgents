import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});
export const sql = postgres(
  process.env.DATABASE_URL ?? 'postgres://hq:hq@127.0.0.1:5432/hq',
  {
    max: 12,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  },
);
export type Database = typeof sql;
export type Transaction = postgres.TransactionSql;
export type Query = Database | Transaction;
