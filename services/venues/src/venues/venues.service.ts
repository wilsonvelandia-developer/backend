import { VenuesRepository } from './venues.repository.js';
import { CreateVenueDto, UpdateVenueDto } from './venues.schema.js';
import { Venue } from './venues.types.js';

/**
 * Venues service — business logic layer.
 */
export class VenuesService {
  constructor(private readonly repo: VenuesRepository) {}

  async getAll(tournamentId?: string, search?: string): Promise<Venue[]> {
    return this.repo.findAll(tournamentId, search);
  }

  async getById(id: string): Promise<Venue> {
    return this.repo.findById(id);
  }

  async create(dto: CreateVenueDto): Promise<Venue> {
    return this.repo.create({
      tournamentId: dto.tournamentId,
      name:         dto.name,
      address:      dto.address,
      city:         dto.city ?? null,
      locationUrl:  dto.locationUrl,
      mapUrl:       dto.mapUrl ?? null,
      capacity:     dto.capacity,
      surfaceType:  dto.surfaceType,
      imageUrl:     dto.imageUrl ?? null,
      phone:        dto.phone ?? null,
      email:        dto.email ?? null,
      description:  dto.description ?? null,
    });
  }

  async update(id: string, dto: UpdateVenueDto): Promise<Venue> {
    return this.repo.update(id, { ...dto });
  }

  async delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}
