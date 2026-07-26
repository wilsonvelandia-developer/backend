const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = fs.readFileSync(path.join(__dirname, 'seed-scouting-demo.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Scouting demo data seeded successfully!');
  } catch (err) {
    console.error('Error seeding:', err.message);
  } finally {
    await pool.end();
  }
}

main();
