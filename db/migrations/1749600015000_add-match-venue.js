/**
 * Migration: add venue field to matches table
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('matches', {
    venue: {
      type: 'varchar(200)',
      comment: 'Name of the court/venue where the match is played',
    },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn('matches', 'venue');
};
