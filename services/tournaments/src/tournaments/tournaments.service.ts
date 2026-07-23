import { Tournament, Phase, PagedResult } from '@tournament/shared';
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

  async getAll(filters: ListTournamentsQuery): Promise<PagedResult<Tournament>> {
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

  /**
   * Gets all staff for a tournament, optionally filtered by role.
   */
  async getStaff(tournamentId: string, role?: string): Promise<unknown[]> {
    return this.repo.getStaff(tournamentId, role);
  }

  /**
   * Removes a staff member from a tournament.
   */
  async removeStaff(tournamentId: string, userId: string): Promise<void> {
    return this.repo.removeStaff(tournamentId, userId);
  }

  // ── Group draw ────────────────────────────────────────────────────────────

  async getGroups(tournamentId: string): Promise<Array<{ teamId: string; teamName: string; groupName: string; drawOrder: number }>> {
    return this.repo.getGroups(tournamentId);
  }

  async saveGroupDraw(tournamentId: string, assignments: Array<{ teamId: string; groupName: string; drawOrder: number }>): Promise<void> {
    return this.repo.saveGroupDraw(tournamentId, assignments);
  }

  /**
   * Automatic group draw — distributes teams equally across groups.
   * Modes:
   *  - 'random': shuffles teams randomly and distributes round-robin
   *  - 'serpentine': distributes in snake order (1→A, 2→B, 3→B, 4→A, 5→A, 6→B...)
   *  - 'seeded': spreads top seeds across groups (pot system)
   *
   * After auto-draw, the result can be adjusted manually via saveGroupDraw (drag-and-drop).
   */
  async autoDrawGroups(
    tournamentId: string,
    options: { mode: 'random' | 'serpentine' | 'seeded'; numGroups?: number },
  ): Promise<{ groups: unknown[]; warnings: string[] }> {
    return this.repo.autoDrawGroups(tournamentId, options);
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

  /**
   * Generates knockout phase matches from group standings.
   * Takes the top N teams per group and creates elimination brackets.
   */
  async generateKnockoutFromStandings(
    tournamentId: string,
    config: {
      teamsPerGroup?: number;
      startDate?: string;
      matchDurationMinutes?: number;
      includeThirdPlace?: boolean;
    },
  ): Promise<unknown[]> {
    return this.repo.generateKnockoutFromStandings(tournamentId, config);
  }

  /**
   * Advances knockout phase: generates next round from winners of finished matches.
   * Optionally creates 3rd-place match from losers.
   */
  async advanceKnockout(
    phaseId: string,
    options: { includeThirdPlace?: boolean; scheduledAt?: string } = {},
  ): Promise<{ nextRoundMatches: unknown[]; thirdPlaceMatch: unknown | null }> {
    return this.repo.advanceKnockout(phaseId, options);
  }

  /**
   * Generates knockout bracket for a specific cup using position ranges.
   * E.g., Copa Oro: positions 1-2 from each group, Copa Plata: positions 3-4.
   */
  async generateKnockoutByCup(
    tournamentId: string,
    cupId: string,
    options: { startDate?: string; scheduledAt?: string } = {},
  ): Promise<unknown[]> {
    return this.repo.generateKnockoutByCup(tournamentId, cupId, options);
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

  // ── Public Enrollment ─────────────────────────────────────────────────────

  /**
   * Self-enrollment: creates a team + players + enrollment record.
   * No auth required — used by public enrollment form.
   * Status starts as 'pending' — organizer approves from admin panel.
   */
  async enrollTeam(tournamentId: string, data: {
    teamName: string;
    shortName?: string;
    clubName?: string;
    imageUrl?: string;
    colorPrimary?: string;
    colorSecondary?: string;
    instagramUrl?: string;
    facebookUrl?: string;
    tiktokUrl?: string;
    youtubeUrl?: string;
    contactName: string;
    contactPhone: string;
    contactEmail?: string;
    players: Array<{ name: string; jerseyNumber: number; position?: string }>;
  }): Promise<{ teamId: string; enrollmentId: string }> {
    return this.repo.enrollTeam(tournamentId, data);
  }

  // ── Venues ─────────────────────────────────────────────────────────────────

  async getVenues(tournamentId: string): Promise<unknown[]> {
    return this.repo.getVenues(tournamentId);
  }
  async createVenue(tournamentId: string, data: { name: string; address?: string; locationUrl?: string; capacity?: number; surfaceType?: string }): Promise<unknown> {
    return this.repo.createVenue(tournamentId, data);
  }
  async updateVenue(venueId: string, data: Record<string, unknown>): Promise<unknown> {
    return this.repo.updateVenue(venueId, data);
  }
  async deleteVenue(venueId: string): Promise<void> {
    return this.repo.deleteVenue(venueId);
  }

  async getVenueCourts(tournamentId: string, venueId: string): Promise<unknown[]> {
    return this.repo.getVenueCourts(tournamentId, venueId);
  }

  async saveVenueCourts(tournamentId: string, venueId: string, courts: Array<{ name: string; courtNumber: number }>): Promise<unknown[]> {
    return this.repo.saveVenueCourts(tournamentId, venueId, courts);
  }

  // ── Announcements ─────────────────────────────────────────────────────────

  async getAnnouncements(tournamentId: string): Promise<unknown[]> {
    return this.repo.getAnnouncements(tournamentId);
  }
  async createAnnouncement(tournamentId: string, authorId: string, data: { title: string; content: string; priority?: string; isPinned?: boolean }): Promise<unknown> {
    return this.repo.createAnnouncement(tournamentId, authorId, data);
  }
  async deleteAnnouncement(annId: string): Promise<void> {
    return this.repo.deleteAnnouncement(annId);
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  async getPayments(tournamentId: string): Promise<unknown[]> {
    return this.repo.getPayments(tournamentId);
  }
  async createPayment(tournamentId: string, recordedBy: string, data: { teamId: string; amount: number; paymentMethod?: string; reference?: string; notes?: string }): Promise<unknown> {
    return this.repo.createPayment(tournamentId, recordedBy, data);
  }
  async updatePaymentStatus(paymentId: string, status: string): Promise<void> {
    return this.repo.updatePaymentStatus(paymentId, status);
  }

  // ── Gallery ───────────────────────────────────────────────────────────────

  async getGallery(tournamentId: string): Promise<unknown[]> {
    return this.repo.getGallery(tournamentId);
  }
  async addPhoto(tournamentId: string, uploadedBy: string, data: { url: string; thumbnailUrl?: string; caption?: string; matchId?: string; teamId?: string }): Promise<unknown> {
    return this.repo.addPhoto(tournamentId, uploadedBy, data);
  }
  async deletePhoto(photoId: string): Promise<void> {
    return this.repo.deletePhoto(photoId);
  }

  // ── Enrollment Management ─────────────────────────────────────────────────

  async getEnrollments(tournamentId: string, status?: string): Promise<unknown[]> {
    return this.repo.getEnrollments(tournamentId, status);
  }

  async updateEnrollmentStatus(tournamentId: string, enrollmentId: string, status: string): Promise<void> {
    return this.repo.updateEnrollmentStatus(tournamentId, enrollmentId, status);
  }

  async deleteEnrollment(tournamentId: string, enrollmentId: string): Promise<void> {
    return this.repo.deleteEnrollment(tournamentId, enrollmentId);
  }

  // ── Observations (Veedor / Observer) ──────────────────────────────────────

  async getObservations(tournamentId: string, userId?: string): Promise<unknown[]> {
    return this.repo.getObservations(tournamentId, userId);
  }

  async createObservation(
    tournamentId: string,
    userId: string,
    subject: string,
    body: string,
    matchId?: string,
  ): Promise<unknown> {
    return this.repo.createObservation(tournamentId, userId, subject, body, matchId);
  }
}
