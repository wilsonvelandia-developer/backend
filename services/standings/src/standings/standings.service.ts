import { Standing } from '@tournament/shared';
import { StandingsRepository } from './standings.repository.js';

export interface GroupStandingEntry {
  teamId: string;
  teamName: string;
  teamShort: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDiff: number;
  setsWon: number;
  setsLost: number;
  fairPlayScore: number;
}

export interface GroupStandings {
  groupName: string;
  standings: GroupStandingEntry[];
}

/**
 * Standings service — retrieval and recalculation.
 */
export class StandingsService {
  constructor(private readonly repo: StandingsRepository) {}

  async getByPhase(phaseId: string): Promise<(Standing & { teamName?: string; teamShort?: string })[]> {
    return this.repo.findByPhase(phaseId);
  }

  async recalculate(phaseId: string): Promise<(Standing & { teamName?: string })[]> {
    return this.repo.recalculate(phaseId);
  }

  /**
   * Returns standings separated by group for a tournament.
   */
  async getByGroups(tournamentId: string): Promise<GroupStandings[]> {
    return this.repo.getByGroups(tournamentId);
  }

  /**
   * Returns top scorers for a tournament, aggregated from match_scorers.
   */
  async getTopScorers(tournamentId: string, limit = 20): Promise<unknown[]> {
    return this.repo.getTopScorers(tournamentId, limit);
  }

  /**
   * Returns individual player statistics aggregated across all matches.
   */
  async getPlayerStats(playerId: string): Promise<unknown> {
    return this.repo.getPlayerStats(playerId);
  }

  /**
   * Returns most sanctioned players for a tournament.
   */
  async getTopSanctioned(tournamentId: string): Promise<unknown[]> {
    return this.repo.getTopSanctioned(tournamentId);
  }
}
