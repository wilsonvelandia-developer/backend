/**
 * Migration: create volleyball_rotations table
 *
 * Tracks the starting lineup and rotation state for each team in each set.
 *
 * Volleyball rotation rules enforced by this schema:
 *   - Exactly 6 positions (1–6) per team per set (enforced in app layer with Zod)
 *   - Each player appears once per set per team (UNIQUE player_id constraint)
 *   - rotation_order (0–5) tracks how many times the team has rotated in the set
 *
 * Court position layout reference:
 *   Position 1 = serve position (back-right)
 *   Position 2 = front-right
 *   Position 3 = front-center
 *   Position 4 = front-left
 *   Position 5 = back-left
 *   Position 6 = back-center
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('volleyball_rotations', {
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
    set_number: {
      type: 'integer',
      notNull: true,
      comment: 'Which set this lineup belongs to (1-indexed)',
    },
    position: {
      type: 'integer',
      notNull: true,
      comment: 'Court position 1–6',
    },
    player_id: {
      type: 'uuid',
      notNull: true,
      references: '"players"',
      onDelete: 'RESTRICT',
    },
    rotation_order: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'How many rotations have happened in this set (0–5)',
    },
  });

  pgm.addConstraint(
    'volleyball_rotations',
    'chk_volleyball_position',
    'CHECK (position BETWEEN 1 AND 6)',
  );

  pgm.addConstraint(
    'volleyball_rotations',
    'chk_volleyball_rotation_order',
    'CHECK (rotation_order BETWEEN 0 AND 5)',
  );

  pgm.addConstraint(
    'volleyball_rotations',
    'chk_volleyball_set_number',
    'CHECK (set_number > 0)',
  );

  // One player per position per team per set
  pgm.addConstraint(
    'volleyball_rotations',
    'uq_volleyball_position',
    'UNIQUE (match_id, team_id, set_number, position)',
  );

  // One position per player per team per set (no duplicates)
  pgm.addConstraint(
    'volleyball_rotations',
    'uq_volleyball_player',
    'UNIQUE (match_id, team_id, set_number, player_id)',
  );

  pgm.createIndex('volleyball_rotations', ['match_id', 'team_id', 'set_number']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('volleyball_rotations');
};
