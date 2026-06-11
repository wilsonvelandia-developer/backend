/**
 * Migration: create substitutions table
 *
 * Records every player substitution with full traceability.
 * Limit enforcement (e.g. max 6 per set in volleyball) is handled
 * in the matches service before inserting here.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('substitutions', {
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
      onDelete: 'RESTRICT',
    },
    period_number: {
      type: 'integer',
      notNull: true,
      comment: 'Half/set/quarter number in which the substitution occurred',
    },
    player_out_id: {
      type: 'uuid',
      notNull: true,
      references: '"players"',
      onDelete: 'RESTRICT',
      comment: 'Player leaving the field/court',
    },
    player_in_id: {
      type: 'uuid',
      notNull: true,
      references: '"players"',
      onDelete: 'RESTRICT',
      comment: 'Player entering the field/court',
    },
    minute: {
      type: 'integer',
      comment: 'Match minute (used for football/basketball, null for volleyball)',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint(
    'substitutions',
    'chk_substitutions_different_players',
    'CHECK (player_out_id <> player_in_id)',
  );

  pgm.addConstraint(
    'substitutions',
    'chk_substitutions_period',
    'CHECK (period_number > 0)',
  );

  pgm.addConstraint(
    'substitutions',
    'chk_substitutions_minute',
    'CHECK (minute IS NULL OR minute >= 0)',
  );

  pgm.createIndex('substitutions', 'match_id');
  pgm.createIndex('substitutions', ['match_id', 'team_id', 'period_number']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('substitutions');
};
