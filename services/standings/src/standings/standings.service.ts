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
   * Uses team_groups to determine group membership.
   * Calculates standings from finished matches in "Fase de Grupos" phase.
   * If no matches played yet, returns teams with zeros.
   */
  async getByGroups(tournamentId: string): Promise<GroupStandings[]> {
    return this.repo.getByGroups(tournamentId);
  }
}
