import { Pool } from 'pg';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Shared PostgreSQL connection pool for the sports service.
 * Created once at startup and reused across all requests.
 *
 * Connection errors are logged but do not crash the process —
 * individual queries will fail with a descriptive error instead.
 */
export const pool = new Pool({
  connectionString:    config.db.connectionString,
  max:                 config.db.max,
  idleTimeoutMillis:   config.db.idleTimeoutMs,
  connectionTimeoutMillis: config.db.connectionTimeoutMs,
  ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: true } : false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

/** Verify the DB connection is reachable at startup. */
export async function checkDbConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('Database connection established');
  } finally {
    client.release();
  }
}
