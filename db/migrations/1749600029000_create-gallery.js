/**
 * Migration: create gallery/photos table
 *
 * Stores photo URLs associated with tournaments, matches, or teams.
 * Actual files are stored externally (Cloudinary, S3, etc.).
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('gallery_photos', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tournament_id: {
      type: 'uuid',
      references: '"tournaments"',
      onDelete: 'CASCADE',
      comment: 'Tournament this photo belongs to.',
    },
    match_id: {
      type: 'uuid',
      references: '"matches"',
      onDelete: 'SET NULL',
      comment: 'Optional: specific match the photo is from.',
    },
    team_id: {
      type: 'uuid',
      references: '"teams"',
      onDelete: 'SET NULL',
      comment: 'Optional: specific team in the photo.',
    },
    uploaded_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
    },
    url: {
      type: 'varchar(1000)',
      notNull: true,
      comment: 'URL to the image (external storage).',
    },
    thumbnail_url: {
      type: 'varchar(1000)',
      comment: 'Thumbnail version of the image.',
    },
    caption: {
      type: 'varchar(500)',
      comment: 'Photo description/caption.',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('gallery_photos', 'tournament_id');
  pgm.createIndex('gallery_photos', 'match_id');
  pgm.createIndex('gallery_photos', 'team_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('gallery_photos');
};
