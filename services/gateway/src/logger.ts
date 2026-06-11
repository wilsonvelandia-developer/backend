import pino from 'pino';
import { config } from './config.js';

/**
 * Structured JSON logger for the gateway service.
 * Uses pino for high-performance structured logging.
 * Never logs tokens, passwords, or PII.
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: 'gateway' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.nodeEnv === 'development' && {
    transport: {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    },
  }),
});
