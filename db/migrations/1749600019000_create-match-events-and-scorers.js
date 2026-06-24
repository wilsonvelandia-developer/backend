/**
 * Migration: create match_events and match_scorers tables
 *
 * match_events: generic timeline of all events during a match (audit/replay).
 * match_scorers: tracks which player scored each point/goal (statistics).
 *
 * NOTE: sanction_types and match_sanctions already exist (migration 016).
 *       substitutions already exists (migration 005).
 *       This migration only adds the missing tables for the Live Referee Mode.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Match Events (generic event log / timeline) ─────────────────────────────

  pgm.createTable('match_events', {
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
    event_type: {
      type: 'varchar(30)',
      notNull: true,
      comment: 'Event type: score, substitution, sanction, rotation, period_start, period_end, timeout, match_start, match_end',
    },
    team_id: {
      type: 'uuid',
      references: '"teams"',
      onDelete: 'SET NULL',
      comment: 'Team involved in the event (NULL for match-level events like period_start)',
    },
    player_id: {
      type: 'uuid',
      references: '"players"',
      onDelete: 'SET NULL',
      comment: 'Player involved (NULL for team-level events)',
    },
    period_number: {
      type: 'integer',
      notNull: true,
      comment: 'Period/set number when the event occurred',
    },
    match_minute: {
      type: 'integer',
      comment: 'Match minute (NULL for sports without timer or for non-timed events)',
    },
    payload: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
      comment: 'Extra data depending on event_type (e.g. { points: 2 } for basketball)',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('match_events', 'chk_match_events_type',
    "CHECK (event_type IN ('score', 'substitution', 'sanction', 'rotation', 'period_start', 'period_end', 'timeout', 'match_start', 'match_end'))");
  pgm.addConstraint('match_events', 'chk_match_events_period', 'CHECK (period_number > 0)');
  pgm.addConstraint('match_events', 'chk_match_events_minute', 'CHECK (match_minute IS NULL OR match_minute >= 0)');

  pgm.createIndex('match_events', 'match_id');
  pgm.createIndex('match_events', ['match_id', 'event_type']);
  pgm.createIndex('match_events', ['match_id', 'created_at']);

  // ── Match Scorers (who scored each point/goal) ──────────────────────────────

  pgm.createTable('match_scorers', {
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
    team_id: {
      type: 'uuid',
      notNull: true,
      references: '"teams"',
      onDelete: 'CASCADE',
    },
    player_id: {
      type: 'uuid',
      notNull: true,
      references: '"players"',
      onDelete: 'CASCADE',
    },
    period_number: {
      type: 'integer',
      notNull: true,
      comment: 'Period/set when the score was made',
    },
    match_minute: {
      type: 'integer',
      comment: 'Match minute when scored (NULL for volleyball/tennis)',
    },
    points: {
      type: 'integer',
      notNull: true,
      default: 1,
      comment: 'Points scored: 1 for football/volleyball, 2 or 3 for basketball',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('match_scorers', 'chk_match_scorers_period', 'CHECK (period_number > 0)');
  pgm.addConstraint('match_scorers', 'chk_match_scorers_points', 'CHECK (points > 0)');
  pgm.addConstraint('match_scorers', 'chk_match_scorers_minute', 'CHECK (match_minute IS NULL OR match_minute >= 0)');

  pgm.createIndex('match_scorers', 'match_id');
  pgm.createIndex('match_scorers', ['match_id', 'team_id']);
  pgm.createIndex('match_scorers', ['match_id', 'player_id']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('match_scorers');
  pgm.dropTable('match_events');
};
