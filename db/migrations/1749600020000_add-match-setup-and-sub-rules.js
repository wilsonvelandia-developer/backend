/**
 * Migration: Match setup data and substitution rule configuration
 *
 * 1. tournaments: substitution rules configuration (parametrizable per tournament)
 * 2. matches: coin toss and field side info
 * 3. match_lineups: starting lineup per team per match (titulares, capitán, roles)
 *
 * Substitution rules are configurable per tournament to support:
 * - Football: no re-entry by default (configurable)
 * - Volleyball: paired substitutions, 6 per set max (not counting libero)
 * - Youth categories: relaxed rules (allow re-entry, unlimited subs)
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Tournament substitution rules ───────────────────────────────────────────

  pgm.addColumns('tournaments', {
    allow_reentry: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'If true, a substituted player can re-enter the match. Default false (standard football).',
    },
    enforce_paired_subs: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'If true, volleyball paired-substitution rule applies (player X only by player Y who replaced them).',
    },
    libero_unlimited_subs: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: 'If true, libero can enter/exit without counting towards the substitution limit.',
    },
    max_subs_per_period: {
      type: 'integer',
      comment: 'Override max substitutions per period/set. NULL = use sport default (max_substitutions).',
    },
    require_lineup: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: 'If true, referee must register starting lineup before starting a period.',
    },
  });

  // ── Match setup fields ──────────────────────────────────────────────────────

  pgm.addColumns('matches', {
    coin_toss_winner_team_id: {
      type: 'uuid',
      references: '"teams"',
      onDelete: 'SET NULL',
      comment: 'Team that won the coin toss.',
    },
    field_side_home: {
      type: 'varchar(1)',
      comment: 'Field side chosen by home team: A or B.',
    },
    field_side_away: {
      type: 'varchar(1)',
      comment: 'Field side for away team: A or B (opposite of home).',
    },
    first_serve_team_id: {
      type: 'uuid',
      references: '"teams"',
      onDelete: 'SET NULL',
      comment: 'Team with first serve/kick-off (volleyball: first serve).',
    },
  });

  pgm.addConstraint('matches', 'chk_field_side_home', "CHECK (field_side_home IS NULL OR field_side_home IN ('A', 'B'))");
  pgm.addConstraint('matches', 'chk_field_side_away', "CHECK (field_side_away IS NULL OR field_side_away IN ('A', 'B'))");

  // ── Match Lineups (starting lineup per team per match) ──────────────────────
  // Tracks who starts, who is captain, goalkeeper, libero, and volleyball zones.

  pgm.createTable('match_lineups', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    match_id: {
      type: 'uuid',
      notNull: true,
      references: '"matches"',
      onDelete: 'CASCADE',
    },
    team_id: {
      type: 'uuid',
      notNull: true,
      references: '"teams"',
      onDelete: 'CASCADE',
    },
    player_id: {
      type: 'uuid',
      notNull: true,
      references: '"players"',
      onDelete: 'CASCADE',
    },
    is_starter: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'True if the player is in the starting lineup.',
    },
    is_captain: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'True if this player is the team captain for this match.',
    },
    is_goalkeeper: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Football: true if this player is the goalkeeper.',
    },
    is_libero: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Volleyball: true if this player is the libero.',
    },
    volleyball_zone: {
      type: 'integer',
      comment: 'Volleyball starting zone (1-6) for the first set. NULL for non-volleyball or subs.',
    },
    period_number: {
      type: 'integer',
      notNull: true,
      default: 1,
      comment: 'Period for which this lineup applies. 1 for initial lineup.',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('match_lineups', 'chk_lineup_zone', 'CHECK (volleyball_zone IS NULL OR (volleyball_zone >= 1 AND volleyball_zone <= 6))');
  pgm.addConstraint('match_lineups', 'chk_lineup_period', 'CHECK (period_number > 0)');

  // A player appears once per team per match per period
  pgm.addConstraint('match_lineups', 'uq_lineup_player_match_period', 'UNIQUE (match_id, team_id, player_id, period_number)');

  // Only one captain per team per match per period
  pgm.createIndex('match_lineups', ['match_id', 'team_id', 'period_number']);
  pgm.createIndex('match_lineups', ['match_id', 'team_id', 'is_starter']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('match_lineups');

  pgm.dropConstraint('matches', 'chk_field_side_away');
  pgm.dropConstraint('matches', 'chk_field_side_home');
  pgm.dropColumns('matches', [
    'coin_toss_winner_team_id', 'field_side_home', 'field_side_away', 'first_serve_team_id',
  ]);

  pgm.dropColumns('tournaments', [
    'allow_reentry', 'enforce_paired_subs', 'libero_unlimited_subs',
    'max_subs_per_period', 'require_lineup',
  ]);
};
