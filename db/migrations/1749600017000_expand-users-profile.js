/**
 * Migration: expand users table with complete profile fields
 *
 * New fields:
 *  - first_name, second_name, first_last_name, second_last_name (replace 'name' for structured data)
 *  - document_type (CC, TI, CE, PP, etc.)
 *  - birth_date
 *  - photo_url (profile photo)
 *  - document_front_url (front of ID document)
 *  - document_back_url (back of ID document)
 *  - eps_file_url (health insurance file - photo or PDF)
 *
 * The existing 'name' column is kept for backward compatibility (computed display name).
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('users', {
    first_name: {
      type: 'varchar(100)',
      comment: 'Primer nombre',
    },
    second_name: {
      type: 'varchar(100)',
      comment: 'Segundo nombre (opcional)',
    },
    first_last_name: {
      type: 'varchar(100)',
      comment: 'Primer apellido',
    },
    second_last_name: {
      type: 'varchar(100)',
      comment: 'Segundo apellido (opcional)',
    },
    document_type: {
      type: 'varchar(10)',
      comment: 'Tipo de documento: CC, TI, CE, PP, NIT, RC, etc.',
    },
    birth_date: {
      type: 'date',
      comment: 'Fecha de nacimiento',
    },
    photo_url: {
      type: 'varchar(500)',
      comment: 'URL de la foto de perfil del usuario',
    },
    document_front_url: {
      type: 'varchar(500)',
      comment: 'URL de la foto del documento de identidad (frente)',
    },
    document_back_url: {
      type: 'varchar(500)',
      comment: 'URL de la foto del documento de identidad (reverso)',
    },
    eps_file_url: {
      type: 'varchar(500)',
      comment: 'URL del archivo de EPS (foto o PDF)',
    },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumns('users', [
    'first_name',
    'second_name',
    'first_last_name',
    'second_last_name',
    'document_type',
    'birth_date',
    'photo_url',
    'document_front_url',
    'document_back_url',
    'eps_file_url',
  ]);
};
