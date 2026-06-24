import { describe, it, expect } from 'vitest';
import { SportRulesEngine } from './sport-rules.engine.js';
import { SportRules, MatchPeriodRow } from './matches.types.js';

// ── Test fixtures ───────────────────────────────────────────────────────────

/** Volleyball: best-of-5 sets, 25pts/set, 15 decisive, win by 2, 6 subs/set, rotation. */
const VOLLEYBALL_RULES: SportRules = {
  sportId: 'sport-volleyball',
  sportSlug: 'volleyball',
  hasSets: true,
  setsToWin: 3,
  pointsPerSet: 25,
  decisiveSetPoints: 15,
  winMargin: 2,
  periodsPerMatch: 5,
  maxSubstitutions: 6,
  hasRotation: true,
};

/** Football: 2 halves, no point limit, max 5 subs, no rotation. */
const FOOTBALL_RULES: SportRules = {
  sportId: 'sport-football',
  sportSlug: 'football',
  hasSets: false,
  setsToWin: null,
  pointsPerSet: null,
  decisiveSetPoints: null,
  winMargin: 1,
  periodsPerMatch: 2,
  maxSubstitutions: 5,
  hasRotation: false,
};

/** Basketball: 4 quarters, no point limit, unlimited subs, no rotation. */
const BASKETBALL_RULES: SportRules = {
  sportId: 'sport-basketball',
  sportSlug: 'basketball',
  hasSets: false,
  setsToWin: null,
  pointsPerSet: null,
  decisiveSetPoints: null,
  winMargin: 1,
  periodsPerMatch: 4,
  maxSubstitutions: null,
  hasRotation: false,
};

/** Tennis: best-of-3 sets, 6 games/set, no decisive set points, no subs. */
const TENNIS_RULES: SportRules = {
  sportId: 'sport-tennis',
  sportSlug: 'tennis',
  hasSets: true,
  setsToWin: 2,
  pointsPerSet: 6,
  decisiveSetPoints: null,
  winMargin: 2,
  periodsPerMatch: 3,
  maxSubstitutions: 0,
  hasRotation: false,
};

/** Helper to create a MatchPeriodRow for tests. */
function period(num: number, home: number, away: number, status: 'finished' | 'in_progress' | 'pending' = 'finished'): MatchPeriodRow {
  return {
    id: `period-${num}`,
    match_id: 'match-1',
    period_number: num,
    home_score: home,
    away_score: away,
    status,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SportRulesEngine', () => {
  describe('maxPeriods', () => {
    it('returns 5 for volleyball (best-of-5: setsToWin=3 → 3*2-1=5)', () => {
      const engine = new SportRulesEngine(VOLLEYBALL_RULES);
      expect(engine.maxPeriods()).toBe(5);
    });

    it('returns 3 for tennis (best-of-3: setsToWin=2 → 2*2-1=3)', () => {
      const engine = new SportRulesEngine(TENNIS_RULES);
      expect(engine.maxPeriods()).toBe(3);
    });

    it('returns periodsPerMatch for football (no sets)', () => {
      const engine = new SportRulesEngine(FOOTBALL_RULES);
      expect(engine.maxPeriods()).toBe(2);
    });

    it('returns periodsPerMatch for basketball (no sets)', () => {
      const engine = new SportRulesEngine(BASKETBALL_RULES);
      expect(engine.maxPeriods()).toBe(4);
    });
  });

  describe('isSetFinished', () => {
    const engine = new SportRulesEngine(VOLLEYBALL_RULES);

    it('returns true when home reaches target with required margin (25-23)', () => {
      expect(engine.isSetFinished(25, 23, 25, 2)).toBe(true);
    });

    it('returns true when away wins cleanly (18-25)', () => {
      expect(engine.isSetFinished(18, 25, 25, 2)).toBe(true);
    });

    it('returns true for deuce scenario (27-25)', () => {
      expect(engine.isSetFinished(27, 25, 25, 2)).toBe(true);
    });

    it('returns false when neither team reaches target (20-18)', () => {
      expect(engine.isSetFinished(20, 18, 25, 2)).toBe(false);
    });

    it('returns false when target reached but margin insufficient (25-24)', () => {
      expect(engine.isSetFinished(25, 24, 25, 2)).toBe(false);
    });

    it('returns false for 0-0', () => {
      expect(engine.isSetFinished(0, 0, 25, 2)).toBe(false);
    });

    it('handles decisive set target (15 points)', () => {
      expect(engine.isSetFinished(15, 13, 15, 2)).toBe(true);
      expect(engine.isSetFinished(15, 14, 15, 2)).toBe(false);
      expect(engine.isSetFinished(17, 15, 15, 2)).toBe(true);
    });
  });

  describe('validatePeriodScore (volleyball)', () => {
    const engine = new SportRulesEngine(VOLLEYBALL_RULES);

    it('accepts valid in-progress scores (20-18)', () => {
      expect(() => engine.validatePeriodScore(1, 20, 18)).not.toThrow();
    });

    it('accepts a finished set score (25-20)', () => {
      expect(() => engine.validatePeriodScore(1, 25, 20)).not.toThrow();
    });

    it('accepts deuce extended score (26-24)', () => {
      expect(() => engine.validatePeriodScore(1, 26, 24)).not.toThrow();
    });

    it('accepts long deuce (30-28)', () => {
      expect(() => engine.validatePeriodScore(1, 30, 28)).not.toThrow();
    });

    it('throws for invalid deuce lead (28-25)', () => {
      expect(() => engine.validatePeriodScore(1, 28, 25)).toThrow(/invalid/i);
    });

    it('accepts decisive set score (15-10)', () => {
      expect(() => engine.validatePeriodScore(5, 15, 10)).not.toThrow();
    });

    it('accepts decisive set deuce (17-15)', () => {
      expect(() => engine.validatePeriodScore(5, 17, 15)).not.toThrow();
    });

    it('throws for invalid decisive set score (18-15)', () => {
      expect(() => engine.validatePeriodScore(5, 18, 15)).toThrow(/invalid/i);
    });

    it('accepts 0-0 score', () => {
      expect(() => engine.validatePeriodScore(1, 0, 0)).not.toThrow();
    });
  });

  describe('validatePeriodScore (football — no restrictions)', () => {
    const engine = new SportRulesEngine(FOOTBALL_RULES);

    it('accepts any score (football has no point limits)', () => {
      expect(() => engine.validatePeriodScore(1, 5, 3)).not.toThrow();
      expect(() => engine.validatePeriodScore(2, 0, 0)).not.toThrow();
      expect(() => engine.validatePeriodScore(1, 100, 0)).not.toThrow();
    });
  });

  describe('periodWinner', () => {
    it('returns home when home wins a volleyball set (25-20)', () => {
      const engine = new SportRulesEngine(VOLLEYBALL_RULES);
      expect(engine.periodWinner(1, 25, 20)).toBe('home');
    });

    it('returns away when away wins a volleyball set (20-25)', () => {
      const engine = new SportRulesEngine(VOLLEYBALL_RULES);
      expect(engine.periodWinner(1, 20, 25)).toBe('away');
    });

    it('returns null when set is not finished (20-18)', () => {
      const engine = new SportRulesEngine(VOLLEYBALL_RULES);
      expect(engine.periodWinner(1, 20, 18)).toBeNull();
    });

    it('returns null for football (periods have no individual winners)', () => {
      const engine = new SportRulesEngine(FOOTBALL_RULES);
      expect(engine.periodWinner(1, 3, 0)).toBeNull();
    });

    it('uses decisive set points for last set', () => {
      const engine = new SportRulesEngine(VOLLEYBALL_RULES);
      // Set 5 uses 15 points target
      expect(engine.periodWinner(5, 15, 10)).toBe('home');
      expect(engine.periodWinner(5, 14, 10)).toBeNull();
    });
  });

  describe('matchWinner (set-based — volleyball)', () => {
    const engine = new SportRulesEngine(VOLLEYBALL_RULES);
    const homeId = 'team-home';
    const awayId = 'team-away';

    it('returns homeTeamId when home wins 3 sets', () => {
      const periods = [
        period(1, 25, 20),
        period(2, 25, 18),
        period(3, 25, 22),
        period(4, 0, 0, 'pending'),
        period(5, 0, 0, 'pending'),
      ];
      expect(engine.matchWinner(homeId, awayId, periods)).toBe(homeId);
    });

    it('returns awayTeamId when away wins 3 sets', () => {
      const periods = [
        period(1, 20, 25),
        period(2, 18, 25),
        period(3, 25, 22),
        period(4, 20, 25),
        period(5, 0, 0, 'pending'),
      ];
      expect(engine.matchWinner(homeId, awayId, periods)).toBe(awayId);
    });

    it('returns null when match is not yet decided', () => {
      const periods = [
        period(1, 25, 20),
        period(2, 20, 25),
        period(3, 10, 15, 'in_progress'),
        period(4, 0, 0, 'pending'),
        period(5, 0, 0, 'pending'),
      ];
      expect(engine.matchWinner(homeId, awayId, periods)).toBeNull();
    });

    it('handles full 5-set match (3-2 home)', () => {
      const periods = [
        period(1, 25, 20),
        period(2, 20, 25),
        period(3, 25, 23),
        period(4, 23, 25),
        period(5, 15, 10),
      ];
      expect(engine.matchWinner(homeId, awayId, periods)).toBe(homeId);
    });
  });

  describe('matchWinner (period-based — football)', () => {
    const engine = new SportRulesEngine(FOOTBALL_RULES);
    const homeId = 'team-home';
    const awayId = 'team-away';

    it('returns homeTeamId when home has more total goals', () => {
      const periods = [
        period(1, 2, 1),
        period(2, 1, 0),
      ];
      expect(engine.matchWinner(homeId, awayId, periods)).toBe(homeId);
    });

    it('returns awayTeamId when away has more total goals', () => {
      const periods = [
        period(1, 0, 2),
        period(2, 1, 1),
      ];
      expect(engine.matchWinner(homeId, awayId, periods)).toBe(awayId);
    });

    it('returns draw when total scores are equal', () => {
      const periods = [
        period(1, 1, 1),
        period(2, 0, 0),
      ];
      expect(engine.matchWinner(homeId, awayId, periods)).toBe('draw');
    });

    it('returns null when not all periods are finished', () => {
      const periods = [
        period(1, 2, 1),
        period(2, 0, 0, 'in_progress'),
      ];
      expect(engine.matchWinner(homeId, awayId, periods)).toBeNull();
    });
  });

  describe('matchWinner (period-based — basketball)', () => {
    const engine = new SportRulesEngine(BASKETBALL_RULES);
    const homeId = 'team-home';
    const awayId = 'team-away';

    it('returns winner based on total of 4 quarters', () => {
      const periods = [
        period(1, 28, 22),
        period(2, 20, 25),
        period(3, 30, 18),
        period(4, 22, 30),
      ];
      // home: 28+20+30+22=100, away: 22+25+18+30=95
      expect(engine.matchWinner(homeId, awayId, periods)).toBe(homeId);
    });

    it('returns null if not all 4 quarters finished', () => {
      const periods = [
        period(1, 28, 22),
        period(2, 20, 25),
        period(3, 30, 18),
        period(4, 0, 0, 'in_progress'),
      ];
      expect(engine.matchWinner(homeId, awayId, periods)).toBeNull();
    });
  });

  describe('validateSubstitutionAllowed', () => {
    it('allows substitution when count is below max (volleyball: 6)', () => {
      const engine = new SportRulesEngine(VOLLEYBALL_RULES);
      expect(() => engine.validateSubstitutionAllowed(5)).not.toThrow();
    });

    it('throws when max substitutions reached (volleyball: 6)', () => {
      const engine = new SportRulesEngine(VOLLEYBALL_RULES);
      expect(() => engine.validateSubstitutionAllowed(6)).toThrow(/maximum substitutions/i);
    });

    it('throws when substitutions are not allowed (tennis: 0)', () => {
      const engine = new SportRulesEngine(TENNIS_RULES);
      expect(() => engine.validateSubstitutionAllowed(0)).toThrow(/not allowed/i);
    });

    it('allows unlimited substitutions (basketball: null)', () => {
      const engine = new SportRulesEngine(BASKETBALL_RULES);
      expect(() => engine.validateSubstitutionAllowed(100)).not.toThrow();
    });

    it('allows substitution at count 0 for football', () => {
      const engine = new SportRulesEngine(FOOTBALL_RULES);
      expect(() => engine.validateSubstitutionAllowed(0)).not.toThrow();
    });

    it('throws at max for football (5)', () => {
      const engine = new SportRulesEngine(FOOTBALL_RULES);
      expect(() => engine.validateSubstitutionAllowed(5)).toThrow(/maximum substitutions/i);
    });
  });

  describe('validateRotationAllowed', () => {
    it('does not throw for volleyball (has rotation)', () => {
      const engine = new SportRulesEngine(VOLLEYBALL_RULES);
      expect(() => engine.validateRotationAllowed()).not.toThrow();
    });

    it('throws for football (no rotation)', () => {
      const engine = new SportRulesEngine(FOOTBALL_RULES);
      expect(() => engine.validateRotationAllowed()).toThrow(/not applicable/i);
    });

    it('throws for basketball (no rotation)', () => {
      const engine = new SportRulesEngine(BASKETBALL_RULES);
      expect(() => engine.validateRotationAllowed()).toThrow(/not applicable/i);
    });

    it('throws for tennis (no rotation)', () => {
      const engine = new SportRulesEngine(TENNIS_RULES);
      expect(() => engine.validateRotationAllowed()).toThrow(/not applicable/i);
    });
  });
});
