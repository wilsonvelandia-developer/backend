import { BusinessRuleError } from '@tournament/shared';
import { SportRules, MatchPeriodRow } from './matches.types.js';

/**
 * Sport Rules Engine
 *
 * Data-driven validation of scoring and match rules.
 * No hardcoded sport names — all rules come from the SportRules config loaded from DB.
 * Adding a new sport requires only data changes, no code changes here.
 */
export class SportRulesEngine {
  constructor(private readonly rules: SportRules) {}

  // ── Period / Set count ────────────────────────────────────────────────────

  /**
   * Returns the maximum number of periods for a match.
   * For set-based sports: setsToWin * 2 - 1 (e.g. best-of-5 = max 5 sets).
   * For period-based sports: fixed periodsPerMatch.
   */
  maxPeriods(): number {
    if (this.rules.hasSets && this.rules.setsToWin !== null) {
      return this.rules.setsToWin * 2 - 1;
    }
    return this.rules.periodsPerMatch;
  }

  // ── Score validation ──────────────────────────────────────────────────────

  /**
   * Validates a score update for a given period.
   * For set-based sports: enforces point limits and win-by-margin rules.
   * For period-based sports: any non-negative score is valid.
   *
   * @throws BusinessRuleError if the score violates the sport's rules.
   */
  validatePeriodScore(
    periodNumber: number,
    homeScore: number,
    awayScore: number,
  ): void {
    if (!this.rules.hasSets) {
      // Football, basketball: no point limit per period
      return;
    }

    // Determine if this is the decisive set
    const maxSets = this.maxPeriods();
    const isDecisiveSet = periodNumber === maxSets;

    const pointTarget = isDecisiveSet
      ? (this.rules.decisiveSetPoints ?? this.rules.pointsPerSet)
      : this.rules.pointsPerSet;

    if (pointTarget === null) return;

    const maxScore  = Math.max(homeScore, awayScore);
    const minScore  = Math.min(homeScore, awayScore);
    const margin    = this.rules.winMargin;

    // Score cannot exceed target + unlimited extension (but neither score can be
    // more than margin-1 ahead without the other having reached target first)
    if (maxScore > pointTarget) {
      // Both scores above target is impossible (set would have ended)
      if (minScore >= pointTarget) {
        // Deuce scenario: both at/above target, leader must be exactly +margin ahead
        if (maxScore - minScore > margin) {
          throw new BusinessRuleError(
            `Score ${homeScore}-${awayScore} is invalid: when both teams reach ${pointTarget}, ` +
            `the winner must lead by exactly ${margin} points`,
          );
        }
      }
    }

    // A set is won when one team reaches pointTarget with a margin
    // Validate that if a winner exists the score is consistent
    const setFinished = this.isSetFinished(homeScore, awayScore, pointTarget, margin);
    if (setFinished) {
      const extraPoints = maxScore - pointTarget;
      if (minScore > pointTarget - 1 && extraPoints > 0 && maxScore - minScore !== margin) {
        throw new BusinessRuleError(
          `Score ${homeScore}-${awayScore} is invalid for a finished set`,
        );
      }
    }
  }

  /**
   * Returns true if the set/period has a winner based on current scores.
   */
  isSetFinished(
    homeScore: number,
    awayScore: number,
    pointTarget: number,
    margin: number,
  ): boolean {
    const max = Math.max(homeScore, awayScore);
    const min = Math.min(homeScore, awayScore);
    return max >= pointTarget && (max - min) >= margin;
  }

  /**
   * Determines the winner of a period.
   * Returns 'home' | 'away' | null (if not yet decided).
   */
  periodWinner(
    periodNumber: number,
    homeScore: number,
    awayScore: number,
  ): 'home' | 'away' | null {
    if (!this.rules.hasSets) {
      // For non-set sports periods don't have individual winners —
      // match winner is determined at match finish by total score
      return null;
    }

    const maxSets     = this.maxPeriods();
    const isDecisive  = periodNumber === maxSets;
    const pointTarget = isDecisive
      ? (this.rules.decisiveSetPoints ?? this.rules.pointsPerSet ?? 0)
      : (this.rules.pointsPerSet ?? 0);

    if (this.isSetFinished(homeScore, awayScore, pointTarget, this.rules.winMargin)) {
      return homeScore > awayScore ? 'home' : 'away';
    }
    return null;
  }

  // ── Match winner ──────────────────────────────────────────────────────────

  /**
   * Given all finished periods, determines the overall match winner.
   * For set-based sports: counts sets won.
   * For period-based sports: sums all period scores.
   *
   * Returns 'home' | 'away' | 'draw' | null (match not finished yet).
   */
  matchWinner(
    homeTeamId: string,
    awayTeamId: string,
    periods: MatchPeriodRow[],
  ): string | null {
    if (this.rules.hasSets && this.rules.setsToWin !== null) {
      let homeSets = 0;
      let awaySets = 0;

      for (const p of periods) {
        const target = this.getSetTarget(p.period_number);
        if (this.isSetFinished(p.home_score, p.away_score, target, this.rules.winMargin)) {
          if (p.home_score > p.away_score) homeSets++;
          else awaySets++;
        }
      }

      if (homeSets >= this.rules.setsToWin) return homeTeamId;
      if (awaySets >= this.rules.setsToWin) return awayTeamId;
      return null; // match not finished yet
    }

    // Period-based: only decide winner when all periods are finished
    const finished = periods.filter((p) => p.status === 'finished');
    if (finished.length < this.rules.periodsPerMatch) return null;

    const homeTotal = finished.reduce((s, p) => s + p.home_score, 0);
    const awayTotal = finished.reduce((s, p) => s + p.away_score, 0);

    if (homeTotal > awayTotal) return homeTeamId;
    if (awayTotal > homeTotal) return awayTeamId;
    return 'draw';
  }

  // ── Substitution validation ───────────────────────────────────────────────

  /**
   * Validates that a substitution is allowed given the current substitution count.
   * The limit is per-period for volleyball (per set), per-match for other sports.
   *
   * @throws BusinessRuleError if the limit has been reached.
   */
  validateSubstitutionAllowed(currentCount: number): void {
    if (this.rules.maxSubstitutions === null) return; // unlimited
    if (this.rules.maxSubstitutions === 0) {
      throw new BusinessRuleError(
        `Substitutions are not allowed in ${this.rules.sportSlug}`,
      );
    }
    if (currentCount >= this.rules.maxSubstitutions) {
      throw new BusinessRuleError(
        `Maximum substitutions reached (${this.rules.maxSubstitutions}) for this ${
          this.rules.hasSets ? 'set' : 'match'
        }`,
        { current: currentCount, max: this.rules.maxSubstitutions },
      );
    }
  }

  // ── Volleyball rotation ───────────────────────────────────────────────────

  /**
   * Validates that a rotation is legal given the current rotation state.
   * In volleyball, rotation happens when the receiving team wins the rally to serve.
   * Each rotation moves players one position clockwise (position 1 → serve position).
   *
   * We simply increment rotation_order (0–5) and update court positions.
   * The new position mapping after n rotations is: courtPos = ((origPos - 1 - n) % 6 + 6) % 6 + 1
   */
  validateRotationAllowed(): void {
    if (!this.rules.hasRotation) {
      throw new BusinessRuleError(
        `Rotation tracking is not applicable to ${this.rules.sportSlug}`,
      );
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getSetTarget(setNumber: number): number {
    const maxSets = this.maxPeriods();
    if (setNumber === maxSets && this.rules.decisiveSetPoints !== null) {
      return this.rules.decisiveSetPoints;
    }
    return this.rules.pointsPerSet ?? 0;
  }
}
