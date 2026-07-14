/**
 * Migration: create observations table for veedores (observers).
 * Observers can submit comments/observations about a tournament visible to the organizer.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('observations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tournament_id: {
      type: 'uuid',
      notNull: true,
      references: '"tournaments"',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
      comment: 'Observer who submitted the observation',
    },
    match_id: {
      type: 'uuid',
      references: '"matches"',
      onDelete: 'SET NULL',
      comment: 'Optional reference to a specific match',
    },
    subject: {
      type: 'varchar(200)',
      notNull: true,
    },
    body: {
      type: 'text',
      notNull: true,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'pending'",
      comment: 'pending, reviewed, resolved',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('observations', 'tournament_id');
  pgm.createIndex('observations', 'user_id');
  pgm.createIndex('observations', ['tournament_id', 'status']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('observations');
};
