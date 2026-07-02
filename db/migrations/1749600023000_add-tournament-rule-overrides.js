/**
 * Migration: add sport rule overrides to tournaments
 *
 * Each tournament can override the sport's default rules for its category.
 * NULL = use sport default. When set, overrides the sport config for this tournament.
 *
 * Examples:
 * - Volleyball Benjamín: players_per_team_override=4, points_per_set_override=21,
 *   sets_to_win_override=1, max_substitutions_override=NULL (unlimited)
 * - Football Sub-12: periods_per_match_override=2, match uses 25-minute halves
 * - Volleyball Mini: players_per_team_override=4, sets_to_win_override=2,
 *   points_per_set_override=21, decisive_set_points_override=15
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('tournaments', {
    players_per_team_override: {
      type: 'integer',
      comment: 'Override sport players_per_team. NULL = use sport default. E.g. 4 for mini-volleyball.',
    },
    has_sets_override: {
      type: 'boolean',
      comment: 'Override sport has_sets. NULL = use sport default.',
    },
    sets_to_win_override: {
      type: 'integer',
      comment: 'Override sport sets_to_win. NULL = use sport default. E.g. 1 for single-set tournaments.',
    },
    points_per_set_override: {
      type: 'integer',
      comment: 'Override sport points_per_set. NULL = use sport default. E.g. 21 for youth categories.',
    },
    decisive_set_points_override: {
      type: 'integer',
      comment: 'Override sport decisive_set_points. NULL = use sport default.',
    },
    win_margin_override: {
      type: 'integer',
      comment: 'Override sport win_margin. NULL = use sport default.',
    },
    periods_per_match_override: {
      type: 'integer',
      comment: 'Override sport periods_per_match. NULL = use sport default.',
    },
    max_substitutions_override: {
      type: 'integer',
      comment: 'Override sport max_substitutions per period/match. -1 = unlimited, NULL = use sport default.',
    },
    has_rotation_override: {
      type: 'boolean',
      comment: 'Override sport has_rotation. NULL = use sport default. Set false for youth categories that skip rotation.',
    },
  });

  pgm.addConstraint('tournaments', 'chk_players_override',
    'CHECK (players_per_team_override IS NULL OR players_per_team_override >= 1)');
  pgm.addConstraint('tournaments', 'chk_sets_override',
    'CHECK (sets_to_win_override IS NULL OR sets_to_win_override >= 1)');
  pgm.addConstraint('tournaments', 'chk_points_override',
    'CHECK (points_per_set_override IS NULL OR points_per_set_override >= 1)');
  pgm.addConstraint('tournaments', 'chk_periods_override',
    'CHECK (periods_per_match_override IS NULL OR periods_per_match_override >= 1)');
  pgm.addConstraint('tournaments', 'chk_max_subs_override_v2',
    'CHECK (max_substitutions_override IS NULL OR max_substitutions_override >= -1)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint('tournaments', 'chk_max_subs_override_v2');
  pgm.dropConstraint('tournaments', 'chk_periods_override');
  pgm.dropConstraint('tournaments', 'chk_points_override');
  pgm.dropConstraint('tournaments', 'chk_sets_override');
  pgm.dropConstraint('tournaments', 'chk_players_override');

  pgm.dropColumns('tournaments', [
    'players_per_team_override', 'has_sets_override', 'sets_to_win_override',
    'points_per_set_override', 'decisive_set_points_override', 'win_margin_override',
    'periods_per_match_override', 'max_substitutions_override', 'has_rotation_override',
  ]);
};
