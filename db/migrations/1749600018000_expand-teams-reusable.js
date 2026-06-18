/**
 * Migration: expand teams table for reusable club/team model
 *
 * Changes:
 * 1. Add profile fields: phone, email, social URLs, status, color, variant
 * 2. Create tournament_enrollments table (many-to-many: team ↔ tournament)
 *    This allows one team to participate in multiple tournaments.
 * 3. Keep tournament_id on teams for backward compatibility with existing code.
 *    New teams created without tournament_id are "club-level" teams.
 *
 * Workflow:
 *  - A team is created once with its profile (club info).
 *  - The team is enrolled in tournaments via tournament_enrollments.
 *  - A club can enroll multiple variants (Sub-12, Sub-15) using the 'variant' field.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Expand teams table ────────────────────────────────────────────────────

  // Make tournament_id nullable (club-level teams don't belong to a single tournament)
  pgm.alterColumn('teams', 'tournament_id', { notNull: false });

  pgm.addColumns('teams', {
    phone: {
      type: 'varchar(30)',
      comment: 'Team/club contact phone',
    },
    email: {
      type: 'varchar(255)',
      comment: 'Team/club contact email',
    },
    instagram_url: {
      type: 'varchar(500)',
      comment: 'Instagram profile URL',
    },
    facebook_url: {
      type: 'varchar(500)',
      comment: 'Facebook page URL',
    },
    tiktok_url: {
      type: 'varchar(500)',
      comment: 'TikTok profile URL',
    },
    youtube_url: {
      type: 'varchar(500)',
      comment: 'YouTube channel URL',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'active'",
      comment: 'Team status: active, inactive, suspended',
    },
    color_primary: {
      type: 'varchar(7)',
      comment: 'Primary team color (hex). Used to differentiate teams from same club.',
    },
    color_secondary: {
      type: 'varchar(7)',
      comment: 'Secondary team color (hex).',
    },
    variant: {
      type: 'varchar(50)',
      comment: 'Differentiation label for same-club teams: Sub-12, Equipo B, Femenino, etc.',
    },
  });

  // ── Tournament enrollments (many-to-many) ─────────────────────────────────

  pgm.createTable('tournament_enrollments', {
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
    enrolled_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'active'",
      comment: 'Enrollment status: active, withdrawn, disqualified',
    },
  });

  pgm.addConstraint('tournament_enrollments', 'uq_enrollment_team_tournament', 'UNIQUE (tournament_id, team_id)');
  pgm.createIndex('tournament_enrollments', 'tournament_id');
  pgm.createIndex('tournament_enrollments', 'team_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('tournament_enrollments');

  pgm.dropColumns('teams', [
    'phone', 'email', 'instagram_url', 'facebook_url',
    'tiktok_url', 'youtube_url', 'status',
    'color_primary', 'color_secondary', 'variant',
  ]);

  pgm.alterColumn('teams', 'tournament_id', { notNull: true });
};
