/**
 * Migration: create team_groups table
 *
 * Stores the assignment of teams to groups within a tournament.
 * This is populated by the group draw feature.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('team_groups', {
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
    team_id: {
      type: 'uuid',
      notNull: true,
      references: '"teams"',
      onDelete: 'CASCADE',
    },
    group_name: {
      type: 'varchar(10)',
      notNull: true,
      comment: 'Group label: A, B, C, D, etc.',
    },
    draw_order: {
      type: 'integer',
      notNull: true,
      comment: 'Position within the group (1-indexed)',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('team_groups', 'uq_team_tournament_group', 'UNIQUE (tournament_id, team_id)');
  pgm.createIndex('team_groups', 'tournament_id');
  pgm.createIndex('team_groups', ['tournament_id', 'group_name']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('team_groups');
};
