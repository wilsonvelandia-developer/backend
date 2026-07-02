/**
 * Migration: create notifications table
 *
 * In-app notifications for users — schedule changes, approvals,
 * announcements, payment confirmations, etc.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('notifications', {
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
    },
    type: {
      type: 'varchar(50)',
      notNull: true,
      comment: 'Notification type: schedule_change, payment_confirmed, enrollment_approved, announcement, match_result.',
    },
    title: {
      type: 'varchar(200)',
      notNull: true,
    },
    body: {
      type: 'text',
      notNull: true,
    },
    reference_type: {
      type: 'varchar(50)',
      comment: 'Entity type: tournament, match, payment, announcement.',
    },
    reference_id: {
      type: 'uuid',
      comment: 'FK to the related entity.',
    },
    is_read: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('notifications', 'user_id');
  pgm.createIndex('notifications', ['user_id', 'is_read']);
  pgm.createIndex('notifications', ['user_id', 'created_at']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('notifications');
};
