/**
 * Migration: expand tournament status values
 *
 * Adds: suspended, cancelled, archived
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.dropConstraint('tournaments', 'chk_tournaments_status');
  pgm.addConstraint(
    'tournaments',
    'chk_tournaments_status',
    "CHECK (status IN ('draft', 'active', 'finished', 'suspended', 'cancelled', 'archived'))",
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint('tournaments', 'chk_tournaments_status');
  pgm.addConstraint(
    'tournaments',
    'chk_tournaments_status',
    "CHECK (status IN ('draft', 'active', 'finished'))",
  );
};
