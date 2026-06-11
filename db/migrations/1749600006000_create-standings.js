/**
 * Migration: create standings table
 *
 * One row per team per phase. Updated automatically after each finished match.
 * set_won/sets_lost are only meaningful for set-based sports (volleyball, tennis).
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('standings', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    phase_id: {
      type: 'uuid',
      notNull: true,
      references: '"phases"',
      onDelete: 'CASCADE',
    },
    team_id: {
      type: 'uuid',
      notNull: true,
      references: '"teams"',
      onDelete: 'CASCADE',
    },
    played: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    wins: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    draws: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Only relevant for sports that allow draws (football)',
    },
    losses: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    points: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Tournament points (not score). Calculated from wins/draws/losses',
    },
    sets_won: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Total sets won across all matches (volleyball/tennis)',
    },
    sets_lost: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    score_for: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Total goals/points scored by this team across all matches',
    },
    score_against: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('standings', 'uq_standings_phase_team', 'UNIQUE (phase_id, team_id)');

  pgm.addConstraint(
    'standings',
    'chk_standings_non_negative',
    'CHECK (played >= 0 AND wins >= 0 AND draws >= 0 AND losses >= 0 AND points >= 0)',
  );

  pgm.createIndex('standings', 'phase_id');
  pgm.createIndex('standings', ['phase_id', 'points']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('standings');
};
