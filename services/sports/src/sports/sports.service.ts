import { Sport } from '@tournament/shared';
import { SportsRepository } from './sports.repository.js';
import { CreateSportDto, UpdateSportDto } from './sports.schema.js';

/**
 * Sports service — business logic layer.
 *
 * Sits between the router and the repository.
 * Currently thin (no extra business rules beyond what the DB enforces),
 * but keeps the architecture ready for rules that span multiple entities.
 */
export class SportsService {
  constructor(private readonly repo: SportsRepository) {}

  /** Returns all sports. */
  async getAll(): Promise<Sport[]> {
    return this.repo.findAll();
  }

  /** Returns a sport by UUID. Throws NotFoundError if missing. */
  async getById(id: string): Promise<Sport> {
    return this.repo.findById(id);
  }

  /** Creates a new sport with the given configuration. */
  async create(dto: CreateSportDto): Promise<Sport> {
    return this.repo.create({
      name:               dto.name,
      slug:               dto.slug,
      playersPerTeam:     dto.playersPerTeam,
      hasSets:            dto.hasSets,
      setsToWin:          dto.setsToWin ?? null,
      pointsPerSet:       dto.pointsPerSet ?? null,
      decisiveSetPoints:  dto.decisiveSetPoints ?? null,
      winMargin:          dto.winMargin,
      periodsPerMatch:    dto.periodsPerMatch,
      maxSubstitutions:   dto.maxSubstitutions ?? null,
      hasRotation:        dto.hasRotation,
    });
  }

  /** Partially updates a sport. Throws NotFoundError if missing. */
  async update(id: string, dto: UpdateSportDto): Promise<Sport> {
    return this.repo.update(id, {
      ...(dto.name               !== undefined && { name:              dto.name }),
      ...(dto.slug               !== undefined && { slug:              dto.slug }),
      ...(dto.playersPerTeam     !== undefined && { playersPerTeam:    dto.playersPerTeam }),
      ...(dto.hasSets            !== undefined && { hasSets:           dto.hasSets }),
      ...(dto.setsToWin          !== undefined && { setsToWin:         dto.setsToWin }),
      ...(dto.pointsPerSet       !== undefined && { pointsPerSet:      dto.pointsPerSet }),
      ...(dto.decisiveSetPoints  !== undefined && { decisiveSetPoints: dto.decisiveSetPoints }),
      ...(dto.winMargin          !== undefined && { winMargin:         dto.winMargin }),
      ...(dto.periodsPerMatch    !== undefined && { periodsPerMatch:   dto.periodsPerMatch }),
      ...(dto.maxSubstitutions   !== undefined && { maxSubstitutions:  dto.maxSubstitutions }),
      ...(dto.hasRotation        !== undefined && { hasRotation:       dto.hasRotation }),
    });
  }

  /** Deletes a sport. Throws NotFoundError if missing. */
  async delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}
