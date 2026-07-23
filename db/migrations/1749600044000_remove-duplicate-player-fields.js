/**
 * Migration: remove duplicate personal fields from players table.
 *
 * The players table is a LINK between a user (person) and a team:
 *   - user_id → identifies WHO (personal data lives in users table)
 *   - team_id → identifies WHICH TEAM they play for
 *   - jersey_number, position → team-specific role
 *
 * Personal data (document, photo, EPS, email, phone, birth_date) belongs
 * exclusively in the `users` table to avoid duplication and inconsistency.
 *
 * This migration removes the fields added in 043 that duplicate users data.
 * The enrollment flow will save all personal info in `users` and only
 * team-specific data in `players`.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.dropIndex('players', [], { name: 'idx_players_document' });
  pgm.dropColumns('players', [
    'document_type', 'document_number', 'email', 'phone',
    'birth_date', 'photo_url', 'document_front_url', 'document_back_url', 'eps_file_url',
  ]);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.addColumns('players', {
    document_type:      { type: 'varchar(20)' },
    document_number:    { type: 'varchar(30)' },
    email:              { type: 'varchar(255)' },
    phone:              { type: 'varchar(30)' },
    birth_date:         { type: 'date' },
    photo_url:          { type: 'varchar(500)' },
    document_front_url: { type: 'varchar(500)' },
    document_back_url:  { type: 'varchar(500)' },
    eps_file_url:       { type: 'varchar(500)' },
  });
  pgm.createIndex('players', 'document_number', { where: 'document_number IS NOT NULL', name: 'idx_players_document' });
};
