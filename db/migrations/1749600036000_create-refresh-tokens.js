/**
 * Migration: create refresh_tokens and password_reset_tokens tables.
 *
 * refresh_tokens: Stores hashed refresh tokens for JWT rotation.
 *   - Only the SHA-256 hash is stored (never the plaintext token).
 *   - Tokens are single-use: revoked_at is set after rotation.
 *   - Expired tokens are cleaned up by a periodic job or TTL policy.
 *
 * password_reset_tokens: Stores hashed password reset tokens.
 *   - Valid for 1 hour.
 *   - used_at is set when the token is consumed.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Refresh Tokens ────────────────────────────────────────────────────────
  pgm.createTable('refresh_tokens', {
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
      comment: 'User who owns this refresh token',
    },
    token_hash: {
      type: 'varchar(128)',
      notNull: true,
      unique: true,
      comment: 'SHA-256 hash of the refresh token (never store plaintext)',
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      comment: 'When this token expires (7 days from creation)',
    },
    revoked_at: {
      type: 'timestamptz',
      comment: 'When this token was revoked (used or logout). NULL = active',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('refresh_tokens', 'user_id');
  pgm.createIndex('refresh_tokens', 'token_hash');
  pgm.createIndex('refresh_tokens', 'expires_at', {
    where: 'revoked_at IS NULL',
    name: 'idx_refresh_tokens_active',
  });

  // ── Password Reset Tokens ─────────────────────────────────────────────────
  pgm.createTable('password_reset_tokens', {
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
      comment: 'User who requested the password reset',
    },
    token_hash: {
      type: 'varchar(128)',
      notNull: true,
      unique: true,
      comment: 'SHA-256 hash of the reset token',
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      comment: 'When this token expires (1 hour from creation)',
    },
    used_at: {
      type: 'timestamptz',
      comment: 'When this token was consumed. NULL = not yet used',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('password_reset_tokens', 'user_id');
  pgm.createIndex('password_reset_tokens', 'token_hash');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('password_reset_tokens');
  pgm.dropTable('refresh_tokens');
};
