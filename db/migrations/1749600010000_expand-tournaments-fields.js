/**
 * Migration: expand tournaments table with organizational fields
 *
 * Adds fields for: scheduling, registration, categories, age restrictions,
 * contact info, social media, files, and description.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('tournaments', {
    // ── Scheduling & registration ─────────────────────────────────────────
    start_date: {
      type: 'date',
      comment: 'Tournament start date. Editable only while status = draft.',
    },
    registration_deadline: {
      type: 'date',
      comment: 'Max date for team registration. Must be <= start_date.',
    },

    // ── Structure ─────────────────────────────────────────────────────────
    expected_teams: {
      type: 'integer',
      comment: 'Expected number of teams. Used for group/fixture generation.',
    },
    num_groups: {
      type: 'integer',
      comment: 'Number of groups to create for the group phase.',
    },

    // ── Category & age restrictions ───────────────────────────────────────
    category: {
      type: 'varchar(100)',
      comment: 'Competition category name (e.g. Sub-12, Masculino Libre).',
    },
    birth_year_from: {
      type: 'date',
      comment: 'Min birth date allowed for players. Players born before this are rejected.',
    },
    validate_birth_from: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'When true, player registration validates against birth_year_from.',
    },
    birth_year_to: {
      type: 'date',
      comment: 'Max birth date allowed for players. Players born after this are rejected.',
    },
    validate_birth_to: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'When true, player registration validates against birth_year_to.',
    },

    // ── Contact & location ────────────────────────────────────────────────
    contact_phone: {
      type: 'varchar(30)',
      comment: 'Contact phone number (WhatsApp, calls).',
    },
    address: {
      type: 'varchar(300)',
      comment: 'Physical address of the organizer office or venue.',
    },
    location_url: {
      type: 'varchar(500)',
      comment: 'Google Maps or similar URL for the tournament venue.',
    },

    // ── Media & files ─────────────────────────────────────────────────────
    image_url: {
      type: 'varchar(500)',
      comment: 'Flyer/poster image URL (Instagram story size recommended).',
    },
    description: {
      type: 'text',
      comment: 'Rich text description with tournament details.',
    },
    entry_fee: {
      type: 'varchar(100)',
      comment: 'Cost of participation (informational, e.g. "$200.000 COP").',
    },
    rules_file_url: {
      type: 'varchar(500)',
      comment: 'URL to the tournament rules PDF.',
    },
    invitation_file_url: {
      type: 'varchar(500)',
      comment: 'URL to the tournament invitation PDF.',
    },

    // ── Social media ──────────────────────────────────────────────────────
    instagram_url: {
      type: 'varchar(500)',
      comment: 'Instagram profile or page URL.',
    },
    facebook_url: {
      type: 'varchar(500)',
      comment: 'Facebook page URL.',
    },
    tiktok_url: {
      type: 'varchar(500)',
      comment: 'TikTok profile URL.',
    },
    youtube_url: {
      type: 'varchar(500)',
      comment: 'YouTube channel URL.',
    },
  });

  // Constraints
  pgm.addConstraint(
    'tournaments',
    'chk_registration_before_start',
    'CHECK (registration_deadline IS NULL OR start_date IS NULL OR registration_deadline <= start_date)',
  );

  pgm.addConstraint(
    'tournaments',
    'chk_expected_teams_positive',
    'CHECK (expected_teams IS NULL OR expected_teams >= 2)',
  );

  pgm.addConstraint(
    'tournaments',
    'chk_num_groups_positive',
    'CHECK (num_groups IS NULL OR num_groups >= 1)',
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint('tournaments', 'chk_num_groups_positive');
  pgm.dropConstraint('tournaments', 'chk_expected_teams_positive');
  pgm.dropConstraint('tournaments', 'chk_registration_before_start');

  pgm.dropColumns('tournaments', [
    'start_date', 'registration_deadline', 'expected_teams', 'num_groups',
    'category', 'birth_year_from', 'validate_birth_from',
    'birth_year_to', 'validate_birth_to',
    'contact_phone', 'address', 'location_url',
    'image_url', 'description', 'entry_fee',
    'rules_file_url', 'invitation_file_url',
    'instagram_url', 'facebook_url', 'tiktok_url', 'youtube_url',
  ]);
};
