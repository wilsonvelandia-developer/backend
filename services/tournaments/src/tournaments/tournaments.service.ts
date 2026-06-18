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
      sportId:              dto.sportId,
      name:                 dto.name,
      season:               dto.season ?? null,
      maxSubsOverride:      dto.maxSubsOverride ?? null,
      startDate:            dto.startDate ?? null,
      registrationDeadline: dto.registrationDeadline ?? null,
      expectedTeams:        dto.expectedTeams ?? null,
      numGroups:            dto.numGroups ?? null,
      category:             dto.category ?? null,
      birthYearFrom:        dto.birthYearFrom ?? null,
      validateBirthFrom:    dto.validateBirthFrom ?? false,
      birthYearTo:          dto.birthYearTo ?? null,
      validateBirthTo:      dto.validateBirthTo ?? false,
      contactPhone:         dto.contactPhone ?? null,
      address:              dto.address ?? null,
      locationUrl:          dto.locationUrl ?? null,
      imageUrl:             dto.imageUrl ?? null,
      description:          dto.description ?? null,
      entryFee:             dto.entryFee ?? null,
      rulesFileUrl:         dto.rulesFileUrl ?? null,
      invitationFileUrl:    dto.invitationFileUrl ?? null,
      instagramUrl:         dto.instagramUrl ?? null,
      facebookUrl:          dto.facebookUrl ?? null,
      tiktokUrl:            dto.tiktokUrl ?? null,
      youtubeUrl:           dto.youtubeUrl ?? null,
      matchDurationMinutes: dto.matchDurationMinutes ?? 90,
      matchesPerDay:        dto.matchesPerDay ?? 6,
      firstMatchTime:       dto.firstMatchTime ?? '08:00',
      numVenues:            dto.numVenues ?? 1,
      venueName:            dto.venueName ?? null,
      pointsConfig:         dto.pointsConfig,
      tiebreakerCriteria:   dto.tiebreakerCriteria,
      initialFairPlayScore: dto.initialFairPlayScore,
      teamsPerGroupQualify: dto.teamsPerGroupQualify,
    });
  }

  async update(id: string, dto: UpdateTournamentDto): Promise<Tournament> {
    // Pass through all defined fields — the repository handles the dynamic SET
    const input: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) input[key] = value;
    }
    return this.repo.update(id, input as import('./tournaments.types.js').UpdateTournamentInput);
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

  /**
   * Registers a user as staff (organizer/referee/observer) for a tournament.
   */
  async registerStaff(tournamentId: string, userId: string, staffRole: string): Promise<void> {
    return this.repo.registerStaff(tournamentId, userId, staffRole);
  }

  // ── Group draw ────────────────────────────────────────────────────────────

  async getGroups(tournamentId: string): Promise<Array<{ teamId: string; teamName: string; groupName: string; drawOrder: number }>> {
    return this.repo.getGroups(tournamentId);
  }

  async saveGroupDraw(tournamentId: string, assignments: Array<{ teamId: string; groupName: string; drawOrder: number }>): Promise<void> {
    return this.repo.saveGroupDraw(tournamentId, assignments);
  }

  /**
   * Generates round-robin matches for the group phase.
   * Uses circle method algorithm — no repeated matchups.
   * Creates a "Fase de Grupos" phase if it doesn't exist.
   */
  async generateGroupFixture(
    tournamentId: string,
    config: {
      startDate?: string;
      matchDurationMinutes?: number;
      matchesPerDay?: number;
      firstMatchTime?: string;
      randomOrder?: boolean;
    },
  ): Promise<unknown[]> {
    return this.repo.generateGroupFixture(tournamentId, config);
  }

  // ── Cups ──────────────────────────────────────────────────────────────────

  async getCups(tournamentId: string): Promise<unknown[]> {
    return this.repo.getCups(tournamentId);
  }

  async saveCups(tournamentId: string, cups: Array<{ name: string; orderIndex: number; groupPositionsFrom: number; groupPositionsTo: number; hasSemifinals: boolean; hasThirdPlace: boolean }>): Promise<void> {
    return this.repo.saveCups(tournamentId, cups);
  }

  // ── Sanction Types ────────────────────────────────────────────────────────

  async getSanctionTypes(tournamentId: string): Promise<unknown[]> {
    return this.repo.getSanctionTypes(tournamentId);
  }

  async saveSanctionTypes(tournamentId: string, types: Array<{ name: string; code: string; pointsEffect: number; monetaryValue: number; color: string; icon: string }>): Promise<void> {
    return this.repo.saveSanctionTypes(tournamentId, types);
  }
}
