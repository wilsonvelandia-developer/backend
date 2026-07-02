/**
 * Migration: create payments table
 *
 * Tracks enrollment fee payments per team per tournament.
 * Simple ledger: records what was paid, when, and by whom.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('payments', {
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
    amount: {
      type: 'decimal(12,2)',
      notNull: true,
      comment: 'Payment amount in local currency.',
    },
    currency: {
      type: 'varchar(3)',
      notNull: true,
      default: "'COP'",
    },
    payment_method: {
      type: 'varchar(50)',
      comment: 'Method: cash, transfer, nequi, daviplata, card, other.',
    },
    reference: {
      type: 'varchar(200)',
      comment: 'Payment reference/receipt number.',
    },
    notes: {
      type: 'text',
      comment: 'Optional notes about the payment.',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'confirmed'",
      comment: 'Payment status: pending, confirmed, rejected, refunded.',
    },
    recorded_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: 'Admin/organizer who recorded the payment.',
    },
    paid_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
      comment: 'When the payment was made.',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('payments', 'chk_payment_status',
    "CHECK (status IN ('pending', 'confirmed', 'rejected', 'refunded'))");
  pgm.addConstraint('payments', 'chk_payment_amount',
    'CHECK (amount > 0)');
  pgm.createIndex('payments', 'tournament_id');
  pgm.createIndex('payments', 'team_id');
  pgm.createIndex('payments', ['tournament_id', 'team_id']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('payments');
};
