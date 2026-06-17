/**
 * Migration: add fixture configuration fields to tournaments
 *
 * These fields control the automatic generation of match schedules:
 *  - match_duration_minutes: time per match including breaks (default 90)
 *  - matches_per_day: max matches per venue per day (default 6)
 *  - first_match_time: time of the first match of each day (default 08:00)
 *  - num_venues: number of simultaneous venues/courts (default 1)
 *  - venue_name: default venue name for generated matches
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('tournaments', {
    match_duration_minutes: {
      type: 'integer',
      notNull: true,
      default: 90,
      comment: 'Duration per match in minutes (includes break time). Default 90 = 1h30min.',
    },
    matches_per_day: {
      type: 'integer',
      notNull: true,
      default: 6,
      comment: 'Max matches per venue per day. Default 6 (9 hours / 1.5h each).',
    },
    first_match_time: {
      type: 'time',
      notNull: true,
      default: '08:00',
      comment: 'Start time of first match each day. Default 08:00.',
    },
    num_venues: {
      type: 'integer',
      notNull: true,
      default: 1,
      comment: 'Number of simultaneous venues/courts. Default 1.',
    },
    venue_name: {
      type: 'varchar(200)',
      comment: 'Default venue/court name for generated matches.',
    },
  });

  pgm.addConstraint('tournaments', 'chk_match_duration', 'CHECK (match_duration_minutes >= 30 AND match_duration_minutes <= 300)');
  pgm.addConstraint('tournaments', 'chk_matches_per_day', 'CHECK (matches_per_day >= 1 AND matches_per_day <= 20)');
  pgm.addConstraint('tournaments', 'chk_num_venues', 'CHECK (num_venues >= 1 AND num_venues <= 10)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint('tournaments', 'chk_num_venues');
  pgm.dropConstraint('tournaments', 'chk_matches_per_day');
  pgm.dropConstraint('tournaments', 'chk_match_duration');
  pgm.dropColumns('tournaments', [
    'match_duration_minutes', 'matches_per_day', 'first_match_time', 'num_venues', 'venue_name',
  ]);
};
