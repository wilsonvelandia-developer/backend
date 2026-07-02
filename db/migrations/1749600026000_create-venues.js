/**
 * Migration: create venues table
 *
 * Tracks physical venues/courts where matches are played.
 * Venues belong to a tournament and have schedules.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('venues', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tournament_id: {
      type: 'uuid',
      references: '"tournaments"',
      onDelete: 'CASCADE',
      comment: 'NULL for global venues not tied to a specific tournament.',
    },
    name: {
      type: 'varchar(200)',
      notNull: true,
      comment: 'Venue name: Cancha 1, Coliseo Municipal, etc.',
    },
    address: {
      type: 'varchar(500)',
      comment: 'Physical address.',
    },
    location_url: {
      type: 'varchar(500)',
      comment: 'Google Maps URL.',
    },
    capacity: {
      type: 'integer',
      comment: 'Max spectator capacity.',
    },
    surface_type: {
      type: 'varchar(50)',
      comment: 'Surface: grass, synthetic, concrete, wood, sand.',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('venues', 'tournament_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('venues');
};
