/**
 * Migration: add standings configuration, sanctions, and tournament cups
 *
 * Tables/fields added:
 * 1. tournaments.points_config (JSONB) — points per result (win, draw, loss)
 * 2. tournaments.tiebreaker_criteria (JSONB) — ordered list of tiebreaker rules
 * 3. tournaments.initial_fair_play_score (INT) — starting fair play points
 * 4. tournaments.teams_per_group_qualify (INT) — how many teams qualify per group
 * 5. tournament_cups — defines cups (Oro, Plata) with positions that go to each
 * 6. sanction_types — catalog of sanction types per tournament (yellow, red, etc.)
 * 7. match_sanctions — individual sanctions given during matches
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Tournament config fields ────────────────────────────────────────────────

  pgm.addColumns('tournaments', {
    points_config: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{\"win\": 3, \"draw\": 1, \"loss\": 0}'::jsonb"),
      comment: 'Points awarded per result: { win: N, draw: N, loss: N }. Configurable per sport.',
    },
    tiebreaker_criteria: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'[\"points\", \"goal_difference\", \"goals_for\", \"head_to_head\", \"fair_play\", \"draw\"]'::jsonb"),
      comment: 'Ordered array of tiebreaker criteria. Options: points, goal_difference, goals_for, goals_against, head_to_head, fair_play, draw.',
    },
    initial_fair_play_score: {
      type: 'integer',
      notNull: true,
      default: 1000,
      comment: 'Starting fair play score for each team. Sanctions subtract, good behavior adds.',
    },
    teams_per_group_qualify: {
      type: 'integer',
      notNull: true,
      default: 2,
      comment: 'How many top teams from each group advance to the next phase.',
    },
  });

  // ── Tournament Cups ─────────────────────────────────────────────────────────
  // Defines the cups/prizes of the tournament (Copa Oro, Copa Plata, etc.)
  // Each cup has phases: semifinals, crossed, final

  pgm.createTable('tournament_cups', {
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
    name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Cup name: Copa Oro, Copa Plata, etc.',
    },
    order_index: {
      type: 'integer',
      notNull: true,
      comment: 'Display order (1 = main cup, 2 = secondary, etc.)',
    },
    group_positions_from: {
      type: 'integer',
      notNull: true,
      comment: 'Starting group position that qualifies for this cup (e.g. 1 for top teams).',
    },
    group_positions_to: {
      type: 'integer',
      notNull: true,
      comment: 'Ending group position that qualifies for this cup (e.g. 2 for top 2 teams).',
    },
    has_semifinals: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    has_third_place: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: 'Whether to play a 3rd/4th place match.',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('tournament_cups', 'uq_cup_tournament_order', 'UNIQUE (tournament_id, order_index)');
  pgm.createIndex('tournament_cups', 'tournament_id');

  // ── Sanction Types ──────────────────────────────────────────────────────────
  // Catalog of sanction/card types per tournament

  pgm.createTable('sanction_types', {
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
    name: {
      type: 'varchar(60)',
      notNull: true,
      comment: 'Sanction name: Tarjeta Amarilla, Tarjeta Roja, Fair Play Bonus, etc.',
    },
    code: {
      type: 'varchar(20)',
      notNull: true,
      comment: 'Short code: YELLOW, RED, FAIR_PLAY_BONUS, etc.',
    },
    points_effect: {
      type: 'integer',
      notNull: true,
      comment: 'Points to add (positive) or subtract (negative) from fair play score.',
    },
    monetary_value: {
      type: 'decimal(12,2)',
      default: 0,
      comment: 'Monetary fine/cost associated with this sanction.',
    },
    color: {
      type: 'varchar(7)',
      comment: 'Hex color for visual display (e.g. #FFFF00 for yellow).',
    },
    icon: {
      type: 'varchar(10)',
      comment: 'Emoji or icon for display.',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('sanction_types', 'uq_sanction_code_tournament', 'UNIQUE (tournament_id, code)');
  pgm.createIndex('sanction_types', 'tournament_id');

  // ── Match Sanctions ─────────────────────────────────────────────────────────
  // Individual sanctions given during matches

  pgm.createTable('match_sanctions', {
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
    sanction_type_id: {
      type: 'uuid',
      notNull: true,
      references: '"sanction_types"',
      onDelete: 'RESTRICT',
    },
    team_id: {
      type: 'uuid',
      notNull: true,
      references: '"teams"',
      onDelete: 'CASCADE',
    },
    player_id: {
      type: 'uuid',
      references: '"players"',
      onDelete: 'SET NULL',
      comment: 'NULL if sanction is for the team (bench, staff).',
    },
    minute: {
      type: 'integer',
      comment: 'Match minute when the sanction occurred.',
    },
    period_number: {
      type: 'integer',
      comment: 'Period/set number when it occurred.',
    },
    notes: {
      type: 'varchar(500)',
      comment: 'Optional description of the sanction.',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('match_sanctions', 'match_id');
  pgm.createIndex('match_sanctions', 'team_id');
  pgm.createIndex('match_sanctions', 'player_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('match_sanctions');
  pgm.dropTable('sanction_types');
  pgm.dropTable('tournament_cups');
  pgm.dropColumns('tournaments', [
    'points_config', 'tiebreaker_criteria', 'initial_fair_play_score', 'teams_per_group_qualify',
  ]);
};
