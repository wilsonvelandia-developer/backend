/**
 * Migration: add album support to gallery_photos.
 * Adds: title, description, cover_url, parent_id (for album→photo relationship)
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('gallery_photos', {
    title: { type: 'varchar(200)' },
    description: { type: 'text' },
    cover_url: { type: 'varchar(1000)' },
    parent_id: {
      type: 'uuid',
      references: '"gallery_photos"',
      onDelete: 'CASCADE',
      comment: 'If set, this photo belongs to a parent album entry',
    },
  });

  pgm.createIndex('gallery_photos', 'parent_id', { where: 'parent_id IS NOT NULL' });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumns('gallery_photos', ['title', 'description', 'cover_url', 'parent_id']);
};
