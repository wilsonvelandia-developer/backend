import { Match, Substitution, VolleyballRotationSlot, PagedResult } from '@tournament/shared';
import { MatchesRepository } from './matches.repository.js';
import { NotificationsHelper } from './notifications.helper.js';
import {
  CreateMatchDto, UpdatePeriodScoreDto,
  RegisterLineupDto, RotateTeamDto,
  SubstitutionDto, ListMatchesQuery,
  CreateSanctionDto, CreateMatchEventDto, CreateScorerDto,
  MatchSetupDto, SaveLineupDto,
} from './matches.schema.js';
import { MatchDetail, MatchSanction, MatchEvent, MatchScorer, MatchLineupPlayer, MatchSetup } from './matches.types.js';

/**
 * Matches service — orchestrates match lifecycle, scoring, rotations, substitutions,
 * sanctions, events, and scorers.
 */
export class MatchesService {
  private readonly notifications: NotificationsHelper | null;

  constructor(
    private readonly repo: MatchesRepository,
    notifications?: NotificationsHelper,
  ) {
    this.notifications = notifications ?? null;
  }

  async getAll(filters: ListMatchesQuery): Promise<PagedResult<Match>> {
    return this.repo.findAll(filters);
  }

  async getById(id: string): Promise<MatchDetail> {
    return this.repo.findById(id);
  }

  async create(dto: CreateMatchDto): Promise<Match> {
    return this.repo.create(dto);
  }

  async delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async startMatch(id: string): Promise<MatchDetail> {
    return this.repo.startMatch(id);
  }

  async finishMatch(id: string): Promise<MatchDetail> {
    const detail = await this.repo.finishMatch(id);

    // Auto-recalculate standings for the phase when match ends
    if (detail.match.phaseId) {
      this.repo.recalculateStandings(detail.match.phaseId).catch(() => { /* non-critical */ });
    }

    // Send notification about match result
    if (this.notifications) {
      const home = detail.match.homeTeamName ?? 'Local';
      const away = detail.match.awayTeamName ?? 'Visitante';
      const score = `${detail.match.homeScore ?? 0} - ${detail.match.awayScore ?? 0}`;
      this.notifications.notifyMatchEvent(
        id,
        'Resultado final',
        `${home} ${score} ${away}`,
      ).catch(() => { /* non-critical */ });
    }

    return detail;
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  async updatePeriodScore(
    matchId: string,
    periodNumber: number,
    dto: UpdatePeriodScoreDto,
  ): Promise<MatchDetail> {
    const detail = await this.repo.updatePeriodScore(matchId, periodNumber, dto);

    // Check if the match should be auto-finished (team won required sets)
    const finishedPeriods = detail.periods.filter((p) => p.status === 'finished');
    if (finishedPeriods.length > 0) {
      const homeSets = finishedPeriods.filter((p) => p.homeScore > p.awayScore).length;
      const awaySets = finishedPeriods.filter((p) => p.awayScore > p.homeScore).length;
      const rules = await this.repo.loadSportRules(matchId);

      // Auto-finish match if a team won enough sets
      if (rules.hasSets && rules.setsToWin !== null && (homeSets >= rules.setsToWin || awaySets >= rules.setsToWin)) {
        return this.finishMatch(matchId);
      }
    }

    return detail;
  }

  // ── Volleyball ────────────────────────────────────────────────────────────

  async registerLineup(matchId: string, dto: RegisterLineupDto): Promise<VolleyballRotationSlot[]> {
    return this.repo.registerLineup(matchId, dto);
  }

  async rotateTeam(matchId: string, dto: RotateTeamDto): Promise<VolleyballRotationSlot[]> {
    return this.repo.rotateTeam(matchId, dto);
  }

  async getLineup(matchId: string, teamId: string, setNumber: number): Promise<VolleyballRotationSlot[]> {
    return this.repo.getLineup(matchId, teamId, setNumber);
  }

  // ── Substitutions ─────────────────────────────────────────────────────────

  async addSubstitution(matchId: string, dto: SubstitutionDto): Promise<Substitution> {
    return this.repo.addSubstitution(matchId, dto);
  }

  async getSubstitutions(matchId: string): Promise<Substitution[]> {
    return this.repo.getSubstitutions(matchId);
  }

  // ── Sanctions ─────────────────────────────────────────────────────────────

  async addSanction(matchId: string, dto: CreateSanctionDto): Promise<MatchSanction> {
    return this.repo.addSanction(matchId, dto);
  }

  async getSanctions(matchId: string): Promise<MatchSanction[]> {
    return this.repo.getSanctions(matchId);
  }

  async getSanctionsByPlayer(matchId: string, teamId: string): Promise<unknown[]> {
    return this.repo.getSanctionsByPlayer(matchId, teamId);
  }

  async deleteSanction(matchId: string, sanctionId: string): Promise<void> {
    return this.repo.deleteSanction(matchId, sanctionId);
  }

  // ── Match Events ──────────────────────────────────────────────────────────

  async addEvent(matchId: string, dto: CreateMatchEventDto): Promise<MatchEvent> {
    return this.repo.addEvent(matchId, dto);
  }

  async getEvents(matchId: string): Promise<MatchEvent[]> {
    return this.repo.getEvents(matchId);
  }

  // ── Match Scorers ─────────────────────────────────────────────────────────

  async addScorer(matchId: string, dto: CreateScorerDto): Promise<MatchScorer> {
    return this.repo.addScorer(matchId, dto);
  }

  async getScorers(matchId: string): Promise<MatchScorer[]> {
    return this.repo.getScorers(matchId);
  }

  async undoLastScorer(matchId: string): Promise<void> {
    return this.repo.deleteLastScorer(matchId);
  }

  async undoLastEvent(matchId: string): Promise<void> {
    return this.repo.deleteLastEvent(matchId);
  }

  // ── Match Setup ───────────────────────────────────────────────────────────

  async saveSetup(matchId: string, dto: MatchSetupDto): Promise<void> {
    return this.repo.saveSetup(matchId, dto);
  }

  async getSetup(matchId: string): Promise<MatchSetup> {
    return this.repo.getSetup(matchId);
  }

  // ── Match Lineups ─────────────────────────────────────────────────────────

  async saveMatchLineup(matchId: string, dto: SaveLineupDto): Promise<MatchLineupPlayer[]> {
    return this.repo.saveMatchLineup(matchId, dto);
  }

  async getMatchLineup(matchId: string, teamId: string, periodNumber?: number): Promise<MatchLineupPlayer[]> {
    return this.repo.getMatchLineup(matchId, teamId, periodNumber);
  }

  // ── Sport Rules ───────────────────────────────────────────────────────────

  async getSportRules(matchId: string): Promise<unknown> {
    const rules = await this.repo.loadSportRules(matchId);
    return rules;
  }

  // ── Match Referees ────────────────────────────────────────────────────────

  /**
   * Get matches filtered by referee's assigned tournaments.
   * Only returns matches from tournaments where the user is staff with role 'referee'.
   */
  async getMatchesForReferee(userId: string, status?: string): Promise<Match[]> {
    return this.repo.findMatchesForReferee(userId, status);
  }

  /** Get referees assigned to a specific match. */
  async getMatchReferees(matchId: string): Promise<unknown[]> {
    return this.repo.getMatchReferees(matchId);
  }

  /** Assign a referee to a match. Validates they're staff of the tournament. */
  async assignReferee(matchId: string, userId: string, refereeRole: string): Promise<unknown> {
    return this.repo.assignReferee(matchId, userId, refereeRole);
  }

  /** Remove a referee assignment from a match. */
  async removeReferee(matchId: string, userId: string): Promise<void> {
    return this.repo.removeReferee(matchId, userId);
  }

  // ── Tournament-level aggregates ───────────────────────────────────────────

  /** Get all sanctions (cards) for a tournament with player/team info and suspension status. */
  async getTournamentSanctions(tournamentId: string, phaseId?: string): Promise<unknown[]> {
    return this.repo.findTournamentSanctions(tournamentId, phaseId);
  }

  /** Get top scorers for a tournament with goals, assists, and matches played. */
  async getTournamentScorers(tournamentId: string, phaseId?: string): Promise<unknown[]> {
    return this.repo.findTournamentScorers(tournamentId, phaseId);
  }

  /** Get all match assignments for a specific referee. */
  async getRefereeAssignments(refereeId: string): Promise<unknown[]> {
    return this.repo.findRefereeAssignments(refereeId);
  }

  /** Get sanction types configured for the tournament that owns this match. */
  async getSanctionTypesForMatch(matchId: string): Promise<unknown[]> {
    return this.repo.findSanctionTypesForMatch(matchId);
  }

  /** Select a player as MVP of the match for their team. */
  async selectMvp(matchId: string, playerId: string, teamId: string, selectedBy: string | null): Promise<unknown> {
    return this.repo.selectMvp(matchId, playerId, teamId, selectedBy);
  }

  /** Get MVP(s) for a match with full card data. */
  async getMatchMvps(matchId: string): Promise<unknown[]> {
    return this.repo.getMatchMvps(matchId);
  }
}
