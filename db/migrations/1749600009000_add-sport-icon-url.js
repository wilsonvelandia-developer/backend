/**
 * Migration: add icon_url column to sports table
 *
 * Stores an optional URL to the sport's icon/logo image.
 * If null, the frontend shows a default placeholder image.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('sports', {
    icon_url: {
      type: 'varchar(500)',
      comment: 'URL to sport icon/logo image. NULL = use default placeholder.',
    },
  });

  // Set default icons for existing sports
  pgm.sql(`
    UPDATE sports SET icon_url = 'https://img.icons8.com/color/96/volleyball.png' WHERE slug = 'volleyball';
    UPDATE sports SET icon_url = 'https://img.icons8.com/color/96/football2.png'  WHERE slug = 'football';
    UPDATE sports SET icon_url = 'https://img.icons8.com/color/96/basketball.png' WHERE slug = 'basketball';
    UPDATE sports SET icon_url = 'https://img.icons8.com/color/96/tennis-ball.png' WHERE slug = 'tennis';
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn('sports', 'icon_url');
};
