import { GalleryRepository } from './gallery.repository.js';
import { CreateGalleryPhotoDto } from './gallery.schema.js';
import { GalleryPhoto } from './gallery.types.js';

/**
 * Gallery service — business logic layer.
 */
export class GalleryService {
  constructor(private readonly repo: GalleryRepository) {}

  async getAll(tournamentId?: string, matchId?: string, teamId?: string): Promise<GalleryPhoto[]> {
    return this.repo.findAll(tournamentId, matchId, teamId);
  }

  async getById(id: string): Promise<GalleryPhoto> {
    return this.repo.findById(id);
  }

  async create(dto: CreateGalleryPhotoDto, uploadedBy: string | null): Promise<GalleryPhoto> {
    return this.repo.create({
      tournamentId: dto.tournamentId,
      matchId:      dto.matchId,
      teamId:       dto.teamId,
      uploadedBy,
      url:          dto.url ?? dto.coverUrl ?? null,
      title:        dto.title ?? null,
      description:  dto.description ?? null,
      coverUrl:     dto.coverUrl ?? null,
      thumbnailUrl: dto.thumbnailUrl,
      caption:      dto.caption,
    });
  }

  async delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}
