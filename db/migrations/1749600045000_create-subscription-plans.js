/**
 * Migration: subscription plans, user plan assignment, and organizer invitations.
 *
 * 1. subscription_plans: defines available plans with limits and pricing
 * 2. users: adds plan_id FK + subscription_expires_at for plan enforcement
 * 3. organizer_invitations: tracks invitations sent by admin to organizers
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Subscription Plans ────────────────────────────────────────────────────
  pgm.createTable('subscription_plans', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    slug: {
      type: 'varchar(30)',
      notNull: true,
      unique: true,
      comment: 'URL-safe identifier: basic, professional, premium',
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Display name in Spanish',
    },
    price_cop: {
      type: 'integer',
      notNull: true,
      comment: 'Monthly price in Colombian Pesos (COP)',
    },
    max_teams_per_tournament: {
      type: 'integer',
      notNull: true,
      comment: 'Maximum teams allowed per tournament. 0 = unlimited.',
    },
    max_active_tournaments: {
      type: 'integer',
      notNull: true,
      comment: 'Maximum concurrent active tournaments. 0 = unlimited.',
    },
    max_venues: {
      type: 'integer',
      notNull: true,
      default: 1,
      comment: 'Max simultaneous venues/courts. 0 = unlimited.',
    },
    features: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
      comment: 'Feature flags: { chat, gallery, analytics, pdf, publicEnrollment, notifications, customBranding }',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    display_order: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Seed the 3 plans
  pgm.sql(`
    INSERT INTO subscription_plans (slug, name, price_cop, max_teams_per_tournament, max_active_tournaments, max_venues, features, display_order) VALUES
    ('basic', 'Básico', 49900, 8, 1, 1,
     '{"chat": false, "gallery": false, "analytics": false, "pdf": true, "publicEnrollment": false, "notifications": false, "customBranding": false, "multiCup": false}'::jsonb, 1),
    ('professional', 'Profesional', 149900, 20, 3, 3,
     '{"chat": false, "gallery": true, "analytics": true, "pdf": true, "publicEnrollment": true, "notifications": true, "customBranding": false, "multiCup": true}'::jsonb, 2),
    ('premium', 'Premium', 299900, 32, 0, 0,
     '{"chat": true, "gallery": true, "analytics": true, "pdf": true, "publicEnrollment": true, "notifications": true, "customBranding": true, "multiCup": true}'::jsonb, 3);
  `);

  // ── User plan assignment ──────────────────────────────────────────────────
  pgm.addColumns('users', {
    plan_id: {
      type: 'uuid',
      references: '"subscription_plans"',
      onDelete: 'SET NULL',
      comment: 'Current subscription plan. NULL = no plan (player/parent accounts).',
    },
    subscription_expires_at: {
      type: 'timestamptz',
      comment: 'When the current subscription period ends. NULL = never expires (lifetime/admin).',
    },
  });

  pgm.createIndex('users', 'plan_id', { where: 'plan_id IS NOT NULL', name: 'idx_users_plan' });

  // ── Organizer Invitations ─────────────────────────────────────────────────
  pgm.createTable('organizer_invitations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    invited_by: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
      comment: 'Admin who sent the invitation',
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
      comment: 'Email address the invitation was sent to',
    },
    plan_id: {
      type: 'uuid',
      notNull: true,
      references: '"subscription_plans"',
      onDelete: 'RESTRICT',
      comment: 'Plan assigned to the organizer',
    },
    user_id: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: 'The user account created for this invitation (set after account creation)',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'pending'",
      comment: 'pending, accepted, revoked',
    },
    expires_at: {
      type: 'timestamptz',
      comment: 'When the invitation link expires',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('organizer_invitations', 'chk_invitation_status',
    "CHECK (status IN ('pending', 'accepted', 'revoked'))");
  pgm.createIndex('organizer_invitations', 'email');
  pgm.createIndex('organizer_invitations', 'invited_by');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('organizer_invitations');
  pgm.dropIndex('users', [], { name: 'idx_users_plan' });
  pgm.dropColumns('users', ['plan_id', 'subscription_expires_at']);
  pgm.dropTable('subscription_plans');
};
