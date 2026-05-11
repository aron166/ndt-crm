import { Pool, PoolClient } from 'pg';

const SOURCE_DATABASE_URL =
  process.env.SOURCE_DATABASE_URL ?? 'postgresql://crm:crm@localhost:5433/crm_db';

export const sourcePool = new Pool({ connectionString: SOURCE_DATABASE_URL });

export async function withSourceClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await sourcePool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
