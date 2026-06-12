import { createApp } from './app.js';
import { config }    from './config.js';
import { logger }    from './logger.js';
import { pool }      from './db/pool.js';

async function main() {
  const app = await createApp();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'Standings service started');
  });

  function shutdown(signal: string): void {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async (err) => {
      if (err) { logger.error({ err }, 'Error closing server'); process.exit(1); }
      await pool.end();
      logger.info('DB pool closed — process exiting');
      process.exit(0);
    });
    setTimeout(() => { logger.error('Forced shutdown'); process.exit(1); }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Failed to start standings service:', err);
  process.exit(1);
});
