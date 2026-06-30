/**
 * Migration: add accumulation_limit to sanction_types
 *
 * This enables auto-expulsion logic:
 * - If a sanction type has accumulation_limit = 2 (e.g. yellow card),
 *   then 2 yellows in the same match triggers an automatic red card.
 * - The system looks for a sanction with code 'RED' in the same tournament
 *   to apply as the expulsion sanction.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('sanction_types', {
    accumulation_limit: {
      type: 'integer',
      comment: 'Number of this sanction that triggers auto-expulsion. NULL = no accumulation rule. E.g. 2 for yellow cards.',
    },
  });

  pgm.addConstraint('sanction_types', 'chk_accumulation_limit',
    'CHECK (accumulation_limit IS NULL OR accumulation_limit >= 2)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint('sanction_types', 'chk_accumulation_limit');
  pgm.dropColumn('sanction_types', 'accumulation_limit');
};
