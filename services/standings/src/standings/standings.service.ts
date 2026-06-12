import { Standing } from '@tournament/shared';
import { StandingsRepository } from './standings.repository.js';

/**
 * Standings service — retrieval and recalculation.
 */
export class StandingsService {
  constructor(private readonly repo: StandingsRepository) {}

  /**
   * Returns current standings for a phase, sorted by points and differentials.
   */
  async getByPhase(phaseId: string): Promise<(Standing & { teamName?: string; teamShort?: string })[]> {
    return this.repo.findByPhase(phaseId);
  }

  /**
   * Recalculates standings from scratch for a phase.
   * Called after every match result update.
   * Idempotent — safe to call multiple times.
   */
  async recalculate(phaseId: string): Promise<(Standing & { teamName?: string })[]> {
    return this.repo.recalculate(phaseId);
  }
}
