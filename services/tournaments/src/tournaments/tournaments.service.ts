import { Tournament, Phase } from '@tournament/shared';
import { TournamentsRepository } from './tournaments.repository.js';
import {
  CreateTournamentDto, UpdateTournamentDto,
  CreatePhaseDto, UpdatePhaseDto,
  ListTournamentsQuery,
} from './tournaments.schema.js';

/**
 * Tournaments service — business logic for tournaments and phases.
 */
export class TournamentsService {
  constructor(private readonly repo: TournamentsRepository) {}

  // ── Tournaments ───────────────────────────────────────────────────────────

  async getAll(filters: ListTournamentsQuery): Promise<Tournament[]> {
    return this.repo.findAll(filters);
  }

  async getById(id: string): Promise<Tournament> {
    return this.repo.findById(id);
  }

  async create(dto: CreateTournamentDto): Promise<Tournament> {
    return this.repo.create({
      sportId:         dto.sportId,
      name:            dto.name,
      season:          dto.season ?? null,
      maxSubsOverride: dto.maxSubsOverride ?? null,
    });
  }

  async update(id: string, dto: UpdateTournamentDto): Promise<Tournament> {
    return this.repo.update(id, {
      ...(dto.sportId         !== undefined && { sportId:         dto.sportId }),
      ...(dto.name            !== undefined && { name:            dto.name }),
      ...(dto.season          !== undefined && { season:          dto.season }),
      ...(dto.maxSubsOverride !== undefined && { maxSubsOverride: dto.maxSubsOverride }),
      ...(dto.status          !== undefined && { status:          dto.status }),
    });
  }

  async delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  // ── Phases ────────────────────────────────────────────────────────────────

  async getPhases(tournamentId: string): Promise<Phase[]> {
    // Ensure tournament exists before listing phases
    await this.repo.findById(tournamentId);
    return this.repo.findPhasesByTournament(tournamentId);
  }

  async getPhaseById(tournamentId: string, phaseId: string): Promise<Phase> {
    return this.repo.findPhaseById(tournamentId, phaseId);
  }

  async createPhase(tournamentId: string, dto: CreatePhaseDto): Promise<Phase> {
    return this.repo.createPhase(tournamentId, {
      name:       dto.name,
      format:     dto.format,
      orderIndex: dto.orderIndex,
    });
  }

  async updatePhase(tournamentId: string, phaseId: string, dto: UpdatePhaseDto): Promise<Phase> {
    return this.repo.updatePhase(tournamentId, phaseId, {
      ...(dto.name       !== undefined && { name:       dto.name }),
      ...(dto.format     !== undefined && { format:     dto.format }),
      ...(dto.orderIndex !== undefined && { orderIndex: dto.orderIndex }),
      ...(dto.status     !== undefined && { status:     dto.status }),
    });
  }

  async deletePhase(tournamentId: string, phaseId: string): Promise<void> {
    return this.repo.deletePhase(tournamentId, phaseId);
  }
}
