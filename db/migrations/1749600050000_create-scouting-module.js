/**
 * Migration: Talent Scouting module.
 *
 * Adds:
 * 1. 'talentScouting' feature flag to subscription plans
 * 2. scout_reports table — allows scouts to save notes/ratings on players
 * 3. scout_shortlists table — personal lists of shortlisted players
 *
 * The scouting module provides:
 * - Advanced player search with performance metrics (goals, cards, win rate, age)
 * - Player ranking by computed performance score
 * - Ability to create shortlists and save notes on players
 * - Filterable by tournament, position, age range, performance tier
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Add feature flag to plans
  pgm.sql(`
    UPDATE subscription_plans SET features = features || '{"talentScouting": false}'::jsonb
    WHERE NOT (features ? 'talentScouting');
  `);
  pgm.sql(`
    UPDATE subscription_plans SET features = jsonb_set(features, '{talentScouting}', 'true')
    WHERE slug = 'premium';
  `);

  // ── Scout Reports — notes and ratings per player ──────────────────────────
  pgm.createTable('scout_reports', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    scout_user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
      comment: 'The scout/coach who created this report',
    },
    player_id: {
      type: 'uuid',
      notNull: true,
      references: '"players"',
      onDelete: 'CASCADE',
    },
    overall_rating: {
      type: 'integer',
      comment: 'Overall rating 1-100',
    },
    technical_rating: {
      type: 'integer',
      comment: 'Technical skill rating 1-10',
    },
    physical_rating: {
      type: 'integer',
      comment: 'Physical ability rating 1-10',
    },
    tactical_rating: {
      type: 'integer',
      comment: 'Game intelligence rating 1-10',
    },
    attitude_rating: {
      type: 'integer',
      comment: 'Attitude and discipline rating 1-10',
    },
    notes: {
      type: 'text',
      comment: 'Free-text observations about the player',
    },
    recommendation: {
      type: 'varchar(30)',
      comment: 'follow_up, shortlist, sign, pass',
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

  pgm.addConstraint('scout_reports', 'chk_overall_rating', 'CHECK (overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 100))');
  pgm.addConstraint('scout_reports', 'chk_recommendation', "CHECK (recommendation IS NULL OR recommendation IN ('follow_up', 'shortlist', 'sign', 'pass'))");
  pgm.createIndex('scout_reports', 'scout_user_id');
  pgm.createIndex('scout_reports', 'player_id');
  pgm.addConstraint('scout_reports', 'uq_scout_player', 'UNIQUE (scout_user_id, player_id)');

  // ── Scout Shortlists — personal player collections ────────────────────────
  pgm.createTable('scout_shortlists', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'List name (e.g., "Prospectos Sub-15 2026")',
    },
    description: {
      type: 'varchar(500)',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('scout_shortlists', 'user_id');

  pgm.createTable('scout_shortlist_players', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    shortlist_id: {
      type: 'uuid',
      notNull: true,
      references: '"scout_shortlists"',
      onDelete: 'CASCADE',
    },
    player_id: {
      type: 'uuid',
      notNull: true,
      references: '"players"',
      onDelete: 'CASCADE',
    },
    added_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('scout_shortlist_players', 'uq_shortlist_player', 'UNIQUE (shortlist_id, player_id)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('scout_shortlist_players');
  pgm.dropTable('scout_shortlists');
  pgm.dropTable('scout_reports');
  pgm.sql(`UPDATE subscription_plans SET features = features - 'talentScouting';`);
};
