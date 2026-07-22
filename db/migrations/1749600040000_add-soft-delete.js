/**
 * Migration: add soft-delete columns to tournaments and teams.
 *
 * Instead of physically deleting records, they are marked with:
 *  - is_deleted: boolean (false by default)
 *  - deleted_at: timestamptz (null when active)
 *  - deleted_by: uuid FK → users (who performed the deletion)
 *
 * A partial index on (is_deleted = false) ensures queries that filter
 * active records remain fast without a full table scan.
 *
 * Note: existing DELETE operations should be updated to SET is_deleted = true
 * instead of running a hard DELETE. The old behavior is preserved as a fallback.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Tournaments ───────────────────────────────────────────────────────────
  pgm.addColumn('tournaments', {
    is_deleted: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Soft-delete flag — true means the tournament is archived/removed',
    },
    deleted_at: {
      type: 'timestamptz',
      comment: 'When the tournament was soft-deleted',
    },
    deleted_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: 'User who performed the soft-delete',
    },
  });

  pgm.createIndex('tournaments', 'is_deleted', {
    where: 'is_deleted = false',
    name: 'idx_tournaments_active',
  });

  // ── Teams ─────────────────────────────────────────────────────────────────
  pgm.addColumn('teams', {
    is_deleted: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Soft-delete flag — true means the team is archived/removed',
    },
    deleted_at: {
      type: 'timestamptz',
      comment: 'When the team was soft-deleted',
    },
    deleted_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: 'User who performed the soft-delete',
    },
  });

  pgm.createIndex('teams', 'is_deleted', {
    where: 'is_deleted = false',
    name: 'idx_teams_active',
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex('teams', [], { name: 'idx_teams_active' });
  pgm.dropColumn('teams', ['is_deleted', 'deleted_at', 'deleted_by']);

  pgm.dropIndex('tournaments', [], { name: 'idx_tournaments_active' });
  pgm.dropColumn('tournaments', ['is_deleted', 'deleted_at', 'deleted_by']);
};
