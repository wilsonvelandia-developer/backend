import { Match, Substitution, VolleyballRotationSlot } from '@tournament/shared';
import { MatchesRepository } from './matches.repository.js';
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
  constructor(private readonly repo: MatchesRepository) {}

  async getAll(filters: ListMatchesQuery): Promise<Match[]> {
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
    return this.repo.finishMatch(id);
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  async updatePeriodScore(
    matchId: string,
    periodNumber: number,
    dto: UpdatePeriodScoreDto,
  ): Promise<MatchDetail> {
    return this.repo.updatePeriodScore(matchId, periodNumber, dto);
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
}
