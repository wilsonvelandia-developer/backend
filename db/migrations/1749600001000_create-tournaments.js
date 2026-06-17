/**
 * Migration: create tournaments and phases tables
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('tournaments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    sport_id: {
      type: 'uuid',
      notNull: true,
      references: '"sports"',
      onDelete: 'RESTRICT',
    },
    name: {
      type: 'varchar(200)',
      notNull: true,
    },
    season: {
      type: 'varchar(20)',
      comment: 'e.g. 2026-1, 2026',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'draft',
      comment: 'draft | active | finished',
    },
    max_subs_override: {
      type: 'integer',
      comment: 'Overrides sport default max substitutions for this tournament',
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
    'tournaments',
    'chk_tournaments_status',
    "CHECK (status IN ('draft', 'active', 'finished', 'suspended', 'cancelled', 'archived'))",
  );

  pgm.createIndex('tournaments', 'sport_id');
  pgm.createIndex('tournaments', 'status');

  // ── Phases ────────────────────────────────────────────────────────────────

  pgm.createTable('phases', {
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
    },
    format: {
      type: 'varchar(30)',
      notNull: true,
      comment: 'round_robin | single_elim | double_elim | groups',
    },
    order_index: {
      type: 'integer',
      notNull: true,
      comment: 'Execution order within the tournament (1 = first phase)',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'pending',
      comment: 'pending | active | finished',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint(
    'phases',
    'chk_phases_format',
    "CHECK (format IN ('round_robin', 'single_elim', 'double_elim', 'groups'))",
  );

  pgm.addConstraint(
    'phases',
    'chk_phases_status',
    "CHECK (status IN ('pending', 'active', 'finished'))",
  );

  pgm.addConstraint('phases', 'uq_phases_tournament_order', 'UNIQUE (tournament_id, order_index)');

  pgm.createIndex('phases', 'tournament_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('phases');
  pgm.dropTable('tournaments');
};
