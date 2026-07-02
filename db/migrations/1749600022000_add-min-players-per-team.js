/**
 * Migration: add min_players_per_team to tournaments
 *
 * Allows each tournament to define the minimum number of players
 * required to start a match. This overrides the sport's players_per_team
 * for the validation in the referee setup wizard.
 *
 * Use cases:
 * - Youth categories: may allow starting with fewer players (e.g. 9 instead of 11 in football)
 * - Volleyball: may require exactly 6 (no flexibility)
 * - Friendly tournaments: may allow starting with 5 in football
 *
 * If NULL, the sport's players_per_team is used as both min and max.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('tournaments', {
    min_players_per_team: {
      type: 'integer',
      comment: 'Minimum players required to start a match. NULL = use sport default (players_per_team).',
    },
  });

  pgm.addConstraint('tournaments', 'chk_min_players_positive',
    'CHECK (min_players_per_team IS NULL OR min_players_per_team >= 1)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint('tournaments', 'chk_min_players_positive');
  pgm.dropColumn('tournaments', 'min_players_per_team');
};
