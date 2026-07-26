/**
 * Migration: create match_mvps table for MVP selection per match.
 *
 * The referee/organizer can select 1 or 2 MVPs per match (one per team).
 * When selected, a notification is triggered and the MVP card becomes available.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('match_mvps', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    match_id: {
      type: 'uuid',
      notNull: true,
      references: '"matches"',
      onDelete: 'CASCADE',
    },
    player_id: {
      type: 'uuid',
      notNull: true,
      references: '"players"',
      onDelete: 'CASCADE',
    },
    team_id: {
      type: 'uuid',
      notNull: true,
      references: '"teams"',
      onDelete: 'CASCADE',
    },
    selected_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: 'User who selected this MVP (referee/organizer)',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('match_mvps', 'uq_match_mvp_team', 'UNIQUE (match_id, team_id)');
  pgm.createIndex('match_mvps', 'match_id');
  pgm.createIndex('match_mvps', 'player_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('match_mvps');
};
