import path from 'path';
import dotenv from 'dotenv';

// Load .env from monorepo root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port:     parseInt(optionalEnv('SPORTS_PORT', '3001'), 10),
  nodeEnv:  optionalEnv('NODE_ENV', 'development'),
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
  db: {
    connectionString: requireEnv('DATABASE_URL'),
    max:              10,
    idleTimeoutMs:    30_000,
    connectionTimeoutMs: 5_000,
  },
} as const;
