/**
 * Migration: create sports table
 *
 * Stores each sport and its configurable rule set.
 * Rules are data-driven so new sports require no code changes.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Enable uuid extension if not present
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('sports', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
      unique: true,
      comment: 'Full sport name, e.g. Volleyball',
    },
    slug: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
      comment: 'URL-safe identifier, e.g. volleyball',
    },
    players_per_team: {
      type: 'integer',
      notNull: true,
      comment: 'Official number of players on court/field per team',
    },
    has_sets: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'True for volleyball, tennis — false for football, basketball',
    },
    sets_to_win: {
      type: 'integer',
      comment: 'Sets needed to win the match (null if not set-based)',
    },
    points_per_set: {
      type: 'integer',
      comment: 'Point target per regular set (null if no limit)',
    },
    decisive_set_points: {
      type: 'integer',
      comment: 'Point target for the decisive/final set (e.g. 15 in volleyball)',
    },
    win_margin: {
      type: 'integer',
      notNull: true,
      default: 2,
      comment: 'Extra points margin required to win a set (volleyball: 2)',
    },
    periods_per_match: {
      type: 'integer',
      notNull: true,
      default: 2,
      comment: 'Number of periods/halves/quarters (not used for set-based sports)',
    },
    max_substitutions: {
      type: 'integer',
      comment: 'Max substitutions per team per match/set. NULL means unlimited',
    },
    has_rotation: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'True only for volleyball — enforces court rotation rules',
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

  pgm.addConstraint('sports', 'chk_sports_players_per_team', 'CHECK (players_per_team > 0)');
  pgm.addConstraint('sports', 'chk_sports_win_margin', 'CHECK (win_margin >= 1)');
  pgm.addConstraint('sports', 'chk_sports_periods', 'CHECK (periods_per_match > 0)');

  pgm.createIndex('sports', 'slug');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('sports');
};
