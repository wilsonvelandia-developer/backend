/**
 * Migration: expand players table for complete enrollment data.
 *
 * Adds fields needed for public enrollment and team management:
 *  - document_type, document_number (for user account creation)
 *  - email, phone, birth_date (contact info)
 *  - photo_url (player headshot)
 *  - document_front_url, document_back_url (ID document scans)
 *  - eps_file_url (EPS/health insurance certificate)
 *
 * These fields are stored on the player record (team-specific) rather than
 * solely on the user account because:
 *  1. A player might not have a user account yet (auto-created on enrollment)
 *  2. Documents may differ per tournament/season
 *  3. The organizador needs to see them without accessing user admin
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('players', {
    document_type: {
      type: 'varchar(20)',
      comment: 'Document type: CC, TI, CE, RC, PA, etc.',
    },
    document_number: {
      type: 'varchar(30)',
      comment: 'National ID or passport number',
    },
    email: {
      type: 'varchar(255)',
      comment: 'Player email for communications',
    },
    phone: {
      type: 'varchar(30)',
      comment: 'Player contact phone',
    },
    birth_date: {
      type: 'date',
      comment: 'Date of birth (used for age validation in youth categories)',
    },
    photo_url: {
      type: 'varchar(500)',
      comment: 'Player headshot/photo URL',
    },
    document_front_url: {
      type: 'varchar(500)',
      comment: 'Front side of ID document (photo or PDF URL)',
    },
    document_back_url: {
      type: 'varchar(500)',
      comment: 'Back side of ID document (photo or PDF URL)',
    },
    eps_file_url: {
      type: 'varchar(500)',
      comment: 'EPS/health insurance certificate (photo or PDF URL)',
    },
  });

  pgm.createIndex('players', 'document_number', {
    where: 'document_number IS NOT NULL',
    name: 'idx_players_document',
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex('players', [], { name: 'idx_players_document' });
  pgm.dropColumns('players', [
    'document_type', 'document_number', 'email', 'phone',
    'birth_date', 'photo_url', 'document_front_url', 'document_back_url', 'eps_file_url',
  ]);
};
