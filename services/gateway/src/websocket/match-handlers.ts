import { Server } from 'socket.io';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { getRefereeLock, AuthenticatedSocket } from './socket-server.js';

/**
 * Registers all match-related WebSocket event handlers.
 * The referee emits actions, the server validates, proxies to the matches service,
 * and broadcasts results to all spectators in the match room.
 */
export function registerMatchHandlers(io: Server): void {
  io.on('connection', (socket: AuthenticatedSocket) => {
    const { userId, roles } = socket.data;
    const isReferee = roles.includes('referee') || roles.includes('admin');

    if (!isReferee) return; // Only register referee handlers for referee users

    // ── Helper: validate referee owns the match lock ──────────────────────────
    function validateLock(matchId: string): boolean {
      const lock = getRefereeLock(matchId);
      if (!lock || lock.userId !== userId) {
        socket.emit('error', { message: 'You do not have control of this match' });
        return false;
      }
      return true;
    }

    // ── Helper: proxy to matches service and broadcast result ─────────────────
    async function proxyAndBroadcast(
      matchId: string,
      method: 'POST' | 'PUT',
      path: string,
      body: unknown,
      broadcastEvent: string,
    ): Promise<unknown> {
      const url = `${config.services.matches}${path}`;

      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const json = await response.json() as { data?: unknown; message?: string };

        if (!response.ok) {
          socket.emit('match:error', { matchId, message: json.message ?? 'Operation failed' });
          return null;
        }

        // Broadcast to all in the room (including the referee for confirmation)
        const room = `match:${matchId}`;
        io.to(room).emit(broadcastEvent, { matchId, ...json.data as object });

        return json.data;
      } catch (err) {
        logger.error({ err, matchId, path }, 'Error proxying WebSocket event to matches service');
        socket.emit('match:error', { matchId, message: 'Internal server error' });
        return null;
      }
    }

    // ── referee:score — add point and optionally register scorer ──────────────
    socket.on('referee:score', async (data: {
      matchId: string;
      periodNumber: number;
      homeScore: number;
      awayScore: number;
      scorerPlayerId?: string;
      scorerTeamId?: string;
      points?: number;
      matchMinute?: number;
    }) => {
      if (!validateLock(data.matchId)) return;

      // Update period score
      await proxyAndBroadcast(
        data.matchId,
        'PUT',
        `/matches/${data.matchId}/periods/${data.periodNumber}/score`,
        { homeScore: data.homeScore, awayScore: data.awayScore },
        'match:score_update',
      );

      // Register scorer if provided
      if (data.scorerPlayerId && data.scorerTeamId) {
        await proxyAndBroadcast(
          data.matchId,
          'POST',
          `/matches/${data.matchId}/scorers`,
          {
            teamId: data.scorerTeamId,
            playerId: data.scorerPlayerId,
            periodNumber: data.periodNumber,
            matchMinute: data.matchMinute ?? null,
            points: data.points ?? 1,
          },
          'match:scorer_registered',
        );
      }
    });

    // ── referee:substitution ─────────────────────────────────────────────────
    socket.on('referee:substitution', async (data: {
      matchId: string;
      teamId: string;
      periodNumber: number;
      playerOutId: string;
      playerInId: string;
      minute: number | null;
    }) => {
      if (!validateLock(data.matchId)) return;

      await proxyAndBroadcast(
        data.matchId,
        'POST',
        `/matches/${data.matchId}/substitutions`,
        {
          teamId: data.teamId,
          periodNumber: data.periodNumber,
          playerOutId: data.playerOutId,
          playerInId: data.playerInId,
          minute: data.minute,
        },
        'match:substitution',
      );
    });

    // ── referee:sanction ─────────────────────────────────────────────────────
    socket.on('referee:sanction', async (data: {
      matchId: string;
      sanctionTypeId: string;
      teamId: string;
      playerId: string | null;
      periodNumber: number;
      minute: number | null;
      notes?: string;
    }) => {
      if (!validateLock(data.matchId)) return;

      await proxyAndBroadcast(
        data.matchId,
        'POST',
        `/matches/${data.matchId}/sanctions`,
        {
          sanctionTypeId: data.sanctionTypeId,
          teamId: data.teamId,
          playerId: data.playerId,
          periodNumber: data.periodNumber,
          minute: data.minute,
          notes: data.notes ?? null,
        },
        'match:sanction',
      );
    });

    // ── referee:period_start ─────────────────────────────────────────────────
    socket.on('referee:period_start', async (data: { matchId: string; periodNumber: number }) => {
      if (!validateLock(data.matchId)) return;

      // Record event
      await proxyAndBroadcast(
        data.matchId,
        'POST',
        `/matches/${data.matchId}/events`,
        { eventType: 'period_start', periodNumber: data.periodNumber, payload: {} },
        'match:period_change',
      );
    });

    // ── referee:period_end ───────────────────────────────────────────────────
    socket.on('referee:period_end', async (data: {
      matchId: string;
      periodNumber: number;
      homeScore: number;
      awayScore: number;
    }) => {
      if (!validateLock(data.matchId)) return;

      await proxyAndBroadcast(
        data.matchId,
        'POST',
        `/matches/${data.matchId}/events`,
        {
          eventType: 'period_end',
          periodNumber: data.periodNumber,
          payload: { homeScore: data.homeScore, awayScore: data.awayScore },
        },
        'match:period_change',
      );
    });

    // ── referee:match_end ────────────────────────────────────────────────────
    socket.on('referee:match_end', async (data: { matchId: string }) => {
      if (!validateLock(data.matchId)) return;

      // Finish the match (computes winner)
      const result = await proxyAndBroadcast(
        data.matchId,
        'PUT',
        `/matches/${data.matchId}/finish`,
        {},
        'match:finished',
      );

      if (result) {
        const room = `match:${data.matchId}`;
        io.to(room).emit('match:finished', { matchId: data.matchId, ...result as object });

        // Auto-recalculate standings for the match's phase
        try {
          const matchDetail = result as { match?: { phaseId?: string } };
          const phaseId = matchDetail.match?.phaseId;
          if (phaseId) {
            const standingsUrl = `${config.services.standings}/standings/recalculate`;
            const standingsRes = await fetch(standingsUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phaseId }),
            });

            if (standingsRes.ok) {
              const standingsData = await standingsRes.json() as { data?: unknown };
              // Broadcast standings update to all spectators in the room
              io.to(room).emit('standings:updated', {
                matchId: data.matchId,
                phaseId,
                standings: standingsData.data,
              });
              logger.info({ matchId: data.matchId, phaseId }, 'Standings recalculated after match end');
            }
          }
        } catch (err) {
          logger.error({ err, matchId: data.matchId }, 'Failed to recalculate standings after match end');
        }
      }
    });

    // ── referee:timer_sync — broadcast timer state to spectators ──────────────
    socket.on('referee:timer_sync', (data: {
      matchId: string;
      elapsed: number;
      running: boolean;
    }) => {
      if (!validateLock(data.matchId)) return;
      const room = `match:${data.matchId}`;
      socket.to(room).emit('match:timer_sync', data);
    });
  });
}
