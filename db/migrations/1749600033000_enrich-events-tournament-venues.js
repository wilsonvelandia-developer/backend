/**
 * Migration: enrich match_events with partial_score + create tournament_venues join table.
 *
 * 1. Adds partial_score (jsonb) to match_events — stores score at the moment of the event.
 * 2. Creates tournament_venues many-to-many join table.
 * 3. Relaxes venues.tournament_id to nullable (venues can belong to multiple tournaments via join).
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── 1. Enrich match_events with partial score ────────────────────────────
  pgm.addColumns('match_events', {
    partial_score: {
      type: 'jsonb',
      comment: 'Score at the moment of the event, e.g. {"home": 15, "away": 12, "homeSets": 1, "awaySets": 0}',
    },
  });

  // ── 2. Tournament-Venues many-to-many ────────────────────────────────────
  pgm.createTable('tournament_venues', {
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
    venue_id: {
      type: 'uuid',
      notNull: true,
      references: '"venues"',
      onDelete: 'CASCADE',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('tournament_venues', 'uq_tournament_venue',
    'UNIQUE (tournament_id, venue_id)');
  pgm.createIndex('tournament_venues', 'tournament_id');
  pgm.createIndex('tournament_venues', 'venue_id');

  // Remove NOT NULL from the event_type CHECK constraint to allow 'set_end'
  pgm.sql(`ALTER TABLE match_events DROP CONSTRAINT IF EXISTS chk_match_events_type`);
  pgm.addConstraint('match_events', 'chk_match_events_type',
    "CHECK (event_type IN ('score', 'substitution', 'sanction', 'rotation', 'period_start', 'period_end', 'timeout', 'match_start', 'match_end', 'set_end'))");
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('tournament_venues');
  pgm.dropColumns('match_events', ['partial_score']);
  pgm.sql(`ALTER TABLE match_events DROP CONSTRAINT IF EXISTS chk_match_events_type`);
  pgm.addConstraint('match_events', 'chk_match_events_type',
    "CHECK (event_type IN ('score', 'substitution', 'sanction', 'rotation', 'period_start', 'period_end', 'timeout', 'match_start', 'match_end'))");
};
