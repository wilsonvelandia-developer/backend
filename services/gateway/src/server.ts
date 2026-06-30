import { createApp } from './app.js';
import { config }    from './config.js';
import { logger }    from './logger.js';
import { createSocketServer } from './websocket/socket-server.js';
import { registerMatchHandlers } from './websocket/match-handlers.js';

/**
 * Gateway entry point.
 * Starts the HTTP server with WebSocket support and handles graceful shutdown.
 */
const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv },
    'Gateway service started',
  );
});

// ── WebSocket Server ────────────────────────────────────────────────────────
const io = createSocketServer(server);
registerMatchHandlers(io);
logger.info('WebSocket server attached to gateway');

// ── Graceful shutdown ──────────────────────────────────────────────────────
// Stop accepting new connections, let in-flight requests finish, then exit.
function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutdown signal received — closing server');

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error during server close');
      process.exit(1);
    }
    logger.info('Server closed — process exiting');
    process.exit(0);
  });

  // Force exit if shutdown takes longer than 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch unhandled promise rejections — log and exit (let the process manager restart)
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
  process.exit(1);
});
