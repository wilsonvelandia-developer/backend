/**
 * Migration: add composite indexes for query performance.
 *
 * These indexes cover the most common query patterns in list endpoints:
 *  - matches filtered by phase + status (match list, fixture view)
 *  - matches filtered by phase + scheduled date (calendar view)
 *  - match_events ordered by match + creation time (timeline)
 *  - match_scorers by match (scorer list per match)
 *  - standings by phase (leaderboard queries)
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Matches: commonly filtered by phase + status
  pgm.createIndex('matches', ['phase_id', 'status'], {
    name: 'idx_matches_phase_status',
  });

  // Matches: commonly sorted by scheduled date within a phase
  pgm.createIndex('matches', ['phase_id', 'scheduled_at'], {
    name: 'idx_matches_phase_scheduled',
  });

  // Match events: timeline queries ordered by creation
  pgm.createIndex('match_events', ['match_id', 'created_at'], {
    name: 'idx_match_events_match_created',
  });

  // Match scorers: grouped by match for scorer list
  pgm.createIndex('match_scorers', ['match_id', 'created_at'], {
    name: 'idx_match_scorers_match_created',
  });

  // Match sanctions: grouped by match for sanction list
  pgm.createIndex('match_sanctions', ['match_id', 'created_at'], {
    name: 'idx_match_sanctions_match_created',
  });

  // Standings: leaderboard per phase sorted by points
  pgm.createIndex('standings', ['phase_id', 'points'], {
    name: 'idx_standings_phase_points',
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex('standings', [], { name: 'idx_standings_phase_points' });
  pgm.dropIndex('match_sanctions', [], { name: 'idx_match_sanctions_match_created' });
  pgm.dropIndex('match_scorers', [], { name: 'idx_match_scorers_match_created' });
  pgm.dropIndex('match_events', [], { name: 'idx_match_events_match_created' });
  pgm.dropIndex('matches', [], { name: 'idx_matches_phase_scheduled' });
  pgm.dropIndex('matches', [], { name: 'idx_matches_phase_status' });
};
