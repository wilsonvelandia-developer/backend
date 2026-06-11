/**
 * Migration: create matches and match_periods tables
 *
 * match_periods models any scoring unit:
 *   - Football: period 1 = first half, period 2 = second half
 *   - Volleyball: period 1..5 = sets
 *   - Basketball: period 1..4 = quarters
 *   - Tennis: period 1..5 = sets (each set has its own game scores handled in app layer)
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('matches', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    phase_id: {
      type: 'uuid',
      notNull: true,
      references: '"phases"',
      onDelete: 'RESTRICT',
    },
    home_team_id: {
      type: 'uuid',
      notNull: true,
      references: '"teams"',
      onDelete: 'RESTRICT',
    },
    away_team_id: {
      type: 'uuid',
      notNull: true,
      references: '"teams"',
      onDelete: 'RESTRICT',
    },
    scheduled_at: {
      type: 'timestamptz',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'scheduled',
      comment: 'scheduled | in_progress | finished',
    },
    winner_id: {
      type: 'uuid',
      references: '"teams"',
      comment: 'NULL while match is not finished or if draw',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint(
    'matches',
    'chk_matches_status',
    "CHECK (status IN ('scheduled', 'in_progress', 'finished'))",
  );

  pgm.addConstraint(
    'matches',
    'chk_matches_different_teams',
    'CHECK (home_team_id <> away_team_id)',
  );

  pgm.createIndex('matches', 'phase_id');
  pgm.createIndex('matches', 'home_team_id');
  pgm.createIndex('matches', 'away_team_id');
  pgm.createIndex('matches', 'status');

  // ── Match Periods ─────────────────────────────────────────────────────────

  pgm.createTable('match_periods', {
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
    period_number: {
      type: 'integer',
      notNull: true,
      comment: '1-indexed. For volleyball: set number. For football: half number.',
    },
    home_score: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    away_score: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'pending',
      comment: 'pending | in_progress | finished',
    },
  });

  pgm.addConstraint(
    'match_periods',
    'chk_match_periods_status',
    "CHECK (status IN ('pending', 'in_progress', 'finished'))",
  );

  pgm.addConstraint('match_periods', 'chk_match_periods_scores', 'CHECK (home_score >= 0 AND away_score >= 0)');
  pgm.addConstraint('match_periods', 'chk_match_periods_number', 'CHECK (period_number > 0)');
  pgm.addConstraint('match_periods', 'uq_match_periods_number', 'UNIQUE (match_id, period_number)');

  pgm.createIndex('match_periods', 'match_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('match_periods');
  pgm.dropTable('matches');
};
