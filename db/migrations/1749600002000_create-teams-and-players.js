/**
 * Migration: create teams and players tables
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('teams', {
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
      type: 'varchar(200)',
      notNull: true,
    },
    short_name: {
      type: 'varchar(10)',
      comment: 'Abbreviation shown in standings, e.g. BAR, MAD',
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

  pgm.addConstraint('teams', 'uq_teams_name_tournament', 'UNIQUE (tournament_id, name)');
  pgm.createIndex('teams', 'tournament_id');

  // ── Players ───────────────────────────────────────────────────────────────

  pgm.createTable('players', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    team_id: {
      type: 'uuid',
      notNull: true,
      references: '"teams"',
      onDelete: 'CASCADE',
    },
    name: {
      type: 'varchar(200)',
      notNull: true,
    },
    jersey_number: {
      type: 'integer',
      notNull: true,
      comment: 'Jersey number, must be unique within the team',
    },
    position: {
      type: 'varchar(50)',
      comment: 'Sport-specific position label, e.g. libero, setter, goalkeeper',
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

  pgm.addConstraint('players', 'uq_players_jersey_team', 'UNIQUE (team_id, jersey_number)');
  pgm.addConstraint('players', 'chk_players_jersey', 'CHECK (jersey_number >= 0)');
  pgm.createIndex('players', 'team_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('players');
  pgm.dropTable('teams');
};
