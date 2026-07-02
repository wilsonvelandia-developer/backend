/**
 * Migration: create match_referees table
 *
 * Allows multiple referees per match (principal, assistant, line judge).
 * A referee can only control matches of tournaments they're staff of.
 *
 * Workflow:
 * 1. Admin/organizer assigns referee to tournament via tournament_staff
 * 2. Admin assigns specific referees to matches via match_referees
 * 3. Referee sees only matches of tournaments they're assigned to
 * 4. When opening referee panel, validates user is assigned to this match's tournament
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('match_referees', {
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
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    referee_role: {
      type: 'varchar(30)',
      notNull: true,
      default: "'principal'",
      comment: 'Role in this match: principal, assistant, line_judge, scorer',
    },
    assigned_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('match_referees', 'uq_match_referee', 'UNIQUE (match_id, user_id)');
  pgm.addConstraint('match_referees', 'chk_referee_role',
    "CHECK (referee_role IN ('principal', 'assistant', 'line_judge', 'scorer'))");
  pgm.createIndex('match_referees', 'match_id');
  pgm.createIndex('match_referees', 'user_id');
  pgm.createIndex('match_referees', ['user_id', 'match_id']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('match_referees');
};
