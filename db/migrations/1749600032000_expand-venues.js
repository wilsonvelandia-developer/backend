/**
 * Migration: expand venues table with additional columns.
 * Adds: city, image_url, phone, email, description, map_url, status, updated_at
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('venues', {
    city: { type: 'varchar(100)' },
    image_url: { type: 'varchar(1000)' },
    phone: { type: 'varchar(30)' },
    email: { type: 'varchar(200)' },
    description: { type: 'text' },
    map_url: { type: 'varchar(500)' },
    status: { type: 'varchar(20)', notNull: true, default: "'active'" },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumns('venues', ['city', 'image_url', 'phone', 'email', 'description', 'map_url', 'status', 'updated_at']);
};
