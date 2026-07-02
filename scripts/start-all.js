/**
 * Starts all backend microservices in parallel.
 * Usage: node scripts/start-all.js
 *   or:  npm run start:all
 *
 * Each service logs with its name prefix for easy identification.
 * Press Ctrl+C to stop all services.
 */

const { spawn } = require('child_process');
const path = require('path');

const SERVICES = [
  { name: 'gateway',       port: 3000, path: 'services/gateway/dist/server.js' },
  { name: 'sports',        port: 3001, path: 'services/sports/dist/server.js' },
  { name: 'tournaments',   port: 3002, path: 'services/tournaments/dist/server.js' },
  { name: 'teams',         port: 3003, path: 'services/teams/dist/server.js' },
  { name: 'matches',       port: 3004, path: 'services/matches/dist/server.js' },
  { name: 'standings',     port: 3005, path: 'services/standings/dist/server.js' },
  { name: 'venues',        port: 3006, path: 'services/venues/dist/server.js' },
  { name: 'announcements', port: 3007, path: 'services/announcements/dist/server.js' },
  { name: 'payments',      port: 3008, path: 'services/payments/dist/server.js' },
  { name: 'gallery',       port: 3009, path: 'services/gallery/dist/server.js' },
];

const ROOT = path.resolve(__dirname, '..');
const processes = [];

console.log('🚀 Starting all services...\n');

for (const svc of SERVICES) {
  const fullPath = path.join(ROOT, svc.path);
  const child = spawn('node', [fullPath], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const prefix = `[${svc.name.padEnd(13)}:${svc.port}]`;

  child.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => console.log(`${prefix} ${line}`));
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => console.error(`${prefix} ❌ ${line}`));
  });

  child.on('exit', (code) => {
    console.log(`${prefix} Process exited with code ${code}`);
  });

  processes.push(child);
}

console.log(`\n✅ ${SERVICES.length} services starting. Press Ctrl+C to stop all.\n`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping all services...');
  processes.forEach((p) => p.kill('SIGTERM'));
  setTimeout(() => process.exit(0), 2000);
});

process.on('SIGTERM', () => {
  processes.forEach((p) => p.kill('SIGTERM'));
  setTimeout(() => process.exit(0), 2000);
});
