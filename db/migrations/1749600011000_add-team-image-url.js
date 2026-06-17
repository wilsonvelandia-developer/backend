/**
 * Migration: add image_url column to teams table
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('teams', {
    image_url: {
      type: 'varchar(500)',
      comment: 'Team logo/shield image URL. NULL = use default placeholder.',
    },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn('teams', 'image_url');
};
