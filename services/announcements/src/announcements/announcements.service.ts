import { AnnouncementsRepository } from './announcements.repository.js';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './announcements.schema.js';
import { Announcement } from './announcements.types.js';

/**
 * Announcements service — business logic layer.
 */
export class AnnouncementsService {
  constructor(private readonly repo: AnnouncementsRepository) {}

  async getAll(tournamentId?: string, priority?: string): Promise<Announcement[]> {
    return this.repo.findAll(tournamentId, priority);
  }

  async getById(id: string): Promise<Announcement> {
    return this.repo.findById(id);
  }

  async create(dto: CreateAnnouncementDto, authorId: string): Promise<Announcement> {
    return this.repo.create({
      tournamentId: dto.tournamentId,
      authorId,
      title:        dto.title,
      content:      dto.content,
      priority:     dto.priority,
      isPinned:     dto.isPinned,
      imageUrl:     dto.imageUrl ?? null,
      expiresAt:    dto.expiresAt,
    });
  }

  async update(id: string, dto: UpdateAnnouncementDto): Promise<Announcement> {
    return this.repo.update(id, { ...dto });
  }

  async delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}
