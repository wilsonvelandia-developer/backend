import { Match, Substitution, VolleyballRotationSlot } from '@tournament/shared';
import { MatchesRepository } from './matches.repository.js';
import {
  CreateMatchDto, UpdatePeriodScoreDto,
  RegisterLineupDto, RotateTeamDto,
  SubstitutionDto, ListMatchesQuery,
} from './matches.schema.js';
import { MatchDetail } from './matches.types.js';

/**
 * Matches service — orchestrates match lifecycle, scoring, rotations and substitutions.
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
}
