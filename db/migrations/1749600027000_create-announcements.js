/**
 * Migration: create announcements table
 *
 * Allows organizers to publish announcements visible to teams/players of a tournament.
 * Announcements are text messages with optional priority level.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('announcements', {
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
    author_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
      comment: 'User who posted the announcement.',
    },
    title: {
      type: 'varchar(200)',
      notNull: true,
    },
    content: {
      type: 'text',
      notNull: true,
    },
    priority: {
      type: 'varchar(20)',
      notNull: true,
      default: "'normal'",
      comment: 'Priority level: low, normal, high, urgent.',
    },
    is_pinned: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Pinned announcements appear at the top.',
    },
    published_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    expires_at: {
      type: 'timestamptz',
      comment: 'Auto-hide after this date. NULL = never expires.',
    },
  });

  pgm.addConstraint('announcements', 'chk_priority',
    "CHECK (priority IN ('low', 'normal', 'high', 'urgent'))");
  pgm.createIndex('announcements', 'tournament_id');
  pgm.createIndex('announcements', ['tournament_id', 'published_at']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('announcements');
};
