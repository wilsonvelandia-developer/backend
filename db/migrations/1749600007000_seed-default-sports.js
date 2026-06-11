/**
 * Migration: seed default sports
 *
 * Inserts the four initial sports with their rule configurations.
 * Data-driven approach: adding a new sport here requires no code changes
 * in any microservice.
 *
 * Volleyball rules:
 *   - 6 players per team on court
 *   - Best of 5 sets (first to win 3)
 *   - Sets 1–4: first to 25 with 2-point margin
 *   - Set 5 (decisive): first to 15 with 2-point margin
 *   - Max 6 substitutions per team per set
 *   - Rotation tracking required
 *
 * Football rules:
 *   - 11 players per team
 *   - 2 halves, no point limit
 *   - Max 5 substitutions per match (modern FIFA rule)
 *   - No rotation
 *
 * Basketball rules:
 *   - 5 players per team
 *   - 4 quarters, no point limit
 *   - Unlimited substitutions
 *   - No rotation
 *
 * Tennis rules:
 *   - 1 player per team (singles) — 2 for doubles, configurable per tournament
 *   - Best of 3 sets (first to win 2) — or best of 5 in grand slams
 *   - Sets: first to 6 games with 2-game margin (or tiebreak at 6-6)
 *   - No substitutions
 *   - No rotation
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO sports (
      name, slug,
      players_per_team,
      has_sets, sets_to_win, points_per_set, decisive_set_points, win_margin,
      periods_per_match,
      max_substitutions,
      has_rotation
    ) VALUES
    (
      'Volleyball', 'volleyball',
      6,
      TRUE, 3, 25, 15, 2,
      5,
      6,
      TRUE
    ),
    (
      'Football', 'football',
      11,
      FALSE, NULL, NULL, NULL, 2,
      2,
      5,
      FALSE
    ),
    (
      'Basketball', 'basketball',
      5,
      FALSE, NULL, NULL, NULL, 2,
      4,
      NULL,
      FALSE
    ),
    (
      'Tennis', 'tennis',
      1,
      TRUE, 2, 6, 6, 2,
      3,
      0,
      FALSE
    )
    ON CONFLICT (slug) DO NOTHING;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM sports WHERE slug IN ('volleyball', 'football', 'basketball', 'tennis');
  `);
};
