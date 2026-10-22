import { createApp } from './app.ts';
import { createPostgresDatabase } from './postgres.ts';

export async function createHostedApp() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL precisa apontar para um PostgreSQL persistente.');
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN é necessário para uploads persistentes.');
  const database = await createPostgresDatabase(databaseUrl);
  return createApp({ database, dataDir: '/tmp/spotfy', production: true, hosted: true });
}
