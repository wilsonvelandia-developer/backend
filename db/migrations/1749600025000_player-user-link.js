/**
 * Migration: Link players to users + must_change_password
 *
 * Changes:
 * 1. users: add must_change_password (boolean, default true for all new users)
 * 2. players: add user_id (FK → users, nullable for backward compat with legacy data)
 *
 * The players table becomes a LINK between a user (person) and a team:
 *   - user_id: identifies WHO the player is (their account)
 *   - team_id: which team they belong to
 *   - jersey_number, position: their role in THAT specific team
 *
 * A single user can appear in multiple players rows (one per team/tournament).
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Users: must_change_password ────────────────────────────────────────────
  pgm.addColumns('users', {
    must_change_password: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'If true, user must change password on next login. Set true for auto-created accounts.',
    },
  });

  // ── Players: link to users ─────────────────────────────────────────────────
  pgm.addColumns('players', {
    user_id: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: 'Links this player record to a user account. NULL for legacy/unlinked players.',
    },
  });

  pgm.createIndex('players', 'user_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn('players', 'user_id');
  pgm.dropColumn('users', 'must_change_password');
};
