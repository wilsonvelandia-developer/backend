import { Team, Player } from '@tournament/shared';
import { TeamsRepository } from './teams.repository.js';
import {
  CreateTeamDto, UpdateTeamDto,
  CreatePlayerDto, UpdatePlayerDto,
  ListTeamsQuery,
} from './teams.schema.js';

/**
 * Teams service — business logic for teams and players.
 */
export class TeamsService {
  constructor(private readonly repo: TeamsRepository) {}

  // ── Teams ─────────────────────────────────────────────────────────────────

  async getAll(filters: ListTeamsQuery): Promise<Team[]> {
    return this.repo.findAll(filters);
  }

  async getById(id: string): Promise<Team> {
    return this.repo.findById(id);
  }

  async create(dto: CreateTeamDto): Promise<Team> {
    return this.repo.create({
      tournamentId: dto.tournamentId,
      name:         dto.name,
      shortName:    dto.shortName ?? null,
    });
  }

  async update(id: string, dto: UpdateTeamDto): Promise<Team> {
    return this.repo.update(id, {
      ...(dto.name      !== undefined && { name:      dto.name }),
      ...(dto.shortName !== undefined && { shortName: dto.shortName }),
    });
  }

  async delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  // ── Players ───────────────────────────────────────────────────────────────

  async getPlayers(teamId: string): Promise<Player[]> {
    // Ensure team exists before listing
    await this.repo.findById(teamId);
    return this.repo.findPlayersByTeam(teamId);
  }

  async getPlayerById(teamId: string, playerId: string): Promise<Player> {
    return this.repo.findPlayerById(teamId, playerId);
  }

  async createPlayer(teamId: string, dto: CreatePlayerDto): Promise<Player> {
    return this.repo.createPlayer(teamId, {
      teamId,
      name:         dto.name,
      jerseyNumber: dto.jerseyNumber,
      position:     dto.position ?? null,
    });
  }

  async updatePlayer(teamId: string, playerId: string, dto: UpdatePlayerDto): Promise<Player> {
    return this.repo.updatePlayer(teamId, playerId, {
      ...(dto.name         !== undefined && { name:         dto.name }),
      ...(dto.jerseyNumber !== undefined && { jerseyNumber: dto.jerseyNumber }),
      ...(dto.position     !== undefined && { position:     dto.position }),
      ...(dto.isActive     !== undefined && { isActive:     dto.isActive }),
    });
  }

  async deletePlayer(teamId: string, playerId: string): Promise<void> {
    return this.repo.deletePlayer(teamId, playerId);
  }
}
