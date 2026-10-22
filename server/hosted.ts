import { createApp } from './app.js';
import { createPostgresDatabase } from './postgres.js';

export async function createHostedApp() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL precisa apontar para um PostgreSQL persistente.');
  const database = await createPostgresDatabase(databaseUrl);
  return createApp({ database, dataDir: '/tmp/spotfy', production: true, hosted: true });
}
