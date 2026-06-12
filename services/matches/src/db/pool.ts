import { Pool } from 'pg';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const pool = new Pool({
  connectionString:        config.db.connectionString,
  max:                     config.db.max,
  idleTimeoutMillis:       config.db.idleTimeoutMs,
  connectionTimeoutMillis: config.db.connectionTimeoutMs,
  ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: true } : false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

export async function checkDbConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('Database connection established');
  } finally {
    client.release();
  }
}
