/**
 * Generates proper bcrypt hashes for seed users.
 * Run after executing reset-and-seed-all.sql
 *
 * Usage: node db/seeds/fix-passwords.js
 */
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://tournament_user:change_me_in_production@localhost:5432/tournament_platform',
});

async function main() {
  const adminHash = await bcrypt.hash('admin123', 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [adminHash, 'admin@olimpic.app']);
  console.log('✓ admin@olimpic.app → admin123');

  const testHash = await bcrypt.hash('test123', 10);
  const result = await pool.query("UPDATE users SET password_hash = $1 WHERE email LIKE '%@test.com'", [testHash]);
  console.log(`✓ ${result.rowCount} test users → test123`);

  await pool.end();
  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
