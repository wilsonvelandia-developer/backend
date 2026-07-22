/**
 * Migration: create audit trail infrastructure.
 *
 * 1. Adds `modified_by` (UUID FK → users) to critical tables:
 *    - tournaments, teams, matches
 *
 * 2. Creates `audit_log` table for tracking all write operations:
 *    - table_name, record_id, action (INSERT/UPDATE/DELETE)
 *    - performed_by (user UUID), performed_at (timestamptz)
 *    - old_data, new_data (JSONB for before/after state)
 *
 * The audit_log is populated by application-level inserts (not DB triggers)
 * because the user context (JWT sub) is only available at the Express layer.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Add modified_by to critical tables ────────────────────────────────────

  pgm.addColumn('tournaments', {
    modified_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: 'Last user who modified this tournament',
    },
  });

  pgm.addColumn('teams', {
    modified_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: 'Last user who modified this team',
    },
  });

  pgm.addColumn('matches', {
    modified_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: 'Last user who modified this match',
    },
  });

  // ── Create audit_log table ────────────────────────────────────────────────

  pgm.createTable('audit_log', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    table_name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Name of the table that was modified',
    },
    record_id: {
      type: 'uuid',
      notNull: true,
      comment: 'Primary key of the modified record',
    },
    action: {
      type: 'varchar(10)',
      notNull: true,
      comment: 'INSERT, UPDATE, or DELETE',
    },
    performed_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: 'User who performed the action (from JWT sub)',
    },
    performed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    old_data: {
      type: 'jsonb',
      comment: 'Previous state of the record (null for INSERTs)',
    },
    new_data: {
      type: 'jsonb',
      comment: 'New state of the record (null for DELETEs)',
    },
    metadata: {
      type: 'jsonb',
      comment: 'Additional context (correlation_id, ip, user_agent, etc.)',
    },
  });

  pgm.addConstraint('audit_log', 'chk_audit_action', "CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))");

  // Indexes for common queries
  pgm.createIndex('audit_log', 'table_name');
  pgm.createIndex('audit_log', 'record_id');
  pgm.createIndex('audit_log', 'performed_by');
  pgm.createIndex('audit_log', 'performed_at');
  pgm.createIndex('audit_log', ['table_name', 'record_id']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('audit_log');
  pgm.dropColumn('matches', 'modified_by');
  pgm.dropColumn('teams', 'modified_by');
  pgm.dropColumn('tournaments', 'modified_by');
};
