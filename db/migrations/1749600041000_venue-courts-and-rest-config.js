/**
 * Migration: venue sub-courts, match scheduling validation, and team rest config.
 *
 * 1. Creates `venue_courts` table — a venue (coliseo/cancha) can have multiple
 *    playing spaces (e.g., "Coliseo Norte - Espacio 1", "Coliseo Norte - Espacio 2").
 *
 * 2. Adds `venue_court_id` FK to `matches` — links a match to a specific court/space.
 *    The old `venue` varchar column is kept for backward compatibility (legacy matches).
 *
 * 3. Adds rest configuration to tournaments:
 *    - `enable_rest_validation` (boolean) — toggle on/off
 *    - `min_rest_between_matches` (integer, minutes) — minimum rest for a team between games
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Venue Courts (sub-spaces within a venue) ──────────────────────────────
  pgm.createTable('venue_courts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    venue_id: {
      type: 'uuid',
      notNull: true,
      references: '"venues"',
      onDelete: 'CASCADE',
      comment: 'Parent venue/facility this court belongs to',
    },
    tournament_id: {
      type: 'uuid',
      notNull: true,
      references: '"tournaments"',
      onDelete: 'CASCADE',
      comment: 'Tournament this court is configured for',
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Display name (e.g., "Espacio 1", "Cancha A")',
    },
    court_number: {
      type: 'integer',
      notNull: true,
      comment: 'Sequential number within the venue (1, 2, 3...)',
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

  pgm.addConstraint('venue_courts', 'uq_venue_court_number',
    'UNIQUE (venue_id, tournament_id, court_number)');
  pgm.createIndex('venue_courts', 'tournament_id');
  pgm.createIndex('venue_courts', ['venue_id', 'tournament_id']);

  // ── Add venue_court_id FK to matches ──────────────────────────────────────
  pgm.addColumn('matches', {
    venue_court_id: {
      type: 'uuid',
      references: '"venue_courts"',
      onDelete: 'SET NULL',
      comment: 'Specific court/space where this match is played. NULL = uses legacy venue text field.',
    },
  });

  pgm.createIndex('matches', 'venue_court_id', {
    where: 'venue_court_id IS NOT NULL',
    name: 'idx_matches_venue_court',
  });

  // ── Tournament rest configuration ─────────────────────────────────────────
  pgm.addColumns('tournaments', {
    enable_rest_validation: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'When true, the system validates minimum rest between matches for each team',
    },
    min_rest_between_matches: {
      type: 'integer',
      comment: 'Minimum minutes a team must rest between consecutive matches. NULL or 0 = no limit.',
    },
  });

  pgm.addConstraint('tournaments', 'chk_min_rest',
    'CHECK (min_rest_between_matches IS NULL OR min_rest_between_matches >= 0)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint('tournaments', 'chk_min_rest');
  pgm.dropColumns('tournaments', ['enable_rest_validation', 'min_rest_between_matches']);
  pgm.dropIndex('matches', [], { name: 'idx_matches_venue_court' });
  pgm.dropColumn('matches', 'venue_court_id');
  pgm.dropTable('venue_courts');
};
