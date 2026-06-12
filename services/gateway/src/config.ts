import path from 'path';
import dotenv from 'dotenv';

// Load .env from monorepo root (two levels up from services/gateway)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
// Fallback: also try local .env if present
dotenv.config();

/**
 * Gateway configuration loaded from environment variables.
 * All required variables are validated at startup — the process exits if any is missing.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optionalEnv('GATEWAY_PORT', '3000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  logLevel: optionalEnv('LOG_LEVEL', 'info'),

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '1h'),
  },

  services: {
    sports:      optionalEnv('SPORTS_SERVICE_URL',      'http://localhost:3001'),
    tournaments: optionalEnv('TOURNAMENTS_SERVICE_URL', 'http://localhost:3002'),
    teams:       optionalEnv('TEAMS_SERVICE_URL',       'http://localhost:3003'),
    matches:     optionalEnv('MATCHES_SERVICE_URL',     'http://localhost:3004'),
    standings:   optionalEnv('STANDINGS_SERVICE_URL',   'http://localhost:3005'),
  },

  rateLimit: {
    windowMs:  15 * 60 * 1000, // 15 minutes
    max:       200,             // requests per window per IP
  },
} as const;
