import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verify } from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { registerChatHandlers } from './chat-handlers.js';

/**
 * JWT payload decoded from the auth_token cookie.
 */
interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
}

/**
 * Extended socket with user data from JWT.
 */
export interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email: string;
    roles: string[];
  };
}

/** Tracks which referee is controlling which match. */
const refereeLocks = new Map<string, { socketId: string; userId: string }>();

/**
 * Creates and configures the Socket.IO server with JWT auth and room management.
 * Attaches to the existing HTTP server.
 *
 * Namespaces:
 *  - / (default): Authenticated users (referees, organizers, chat)
 *  - /spectator: Anonymous public namespace for live match viewing (no auth required)
 */
export function createSocketServer(httpServer: HttpServer): Server {
  const allowedOrigins = config.nodeEnv === 'production'
    ? (process.env['FRONTEND_URL'] ? [process.env['FRONTEND_URL']] : [])
    : ['http://localhost:4200', 'http://127.0.0.1:4200'];

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // ── Public /spectator namespace — NO authentication required ────────────────
  const spectatorNs = io.of('/spectator');
  _spectatorNs = spectatorNs;

  spectatorNs.on('connection', (socket: Socket) => {
    // Join match room to receive live score updates
    socket.on('match:join', (data: { matchId: string }) => {
      if (!data.matchId) return;
      socket.join(`match:${data.matchId}`);
    });

    socket.on('match:leave', (data: { matchId: string }) => {
      if (!data.matchId) return;
      socket.leave(`match:${data.matchId}`);
    });

    // Join tournament room for standings/results
    socket.on('tournament:join', (data: { tournamentId: string }) => {
      if (!data.tournamentId) return;
      socket.join(`tournament:${data.tournamentId}`);
    });

    socket.on('tournament:leave', (data: { tournamentId: string }) => {
      if (!data.tournamentId) return;
      socket.leave(`tournament:${data.tournamentId}`);
    });
  });

  // Helper: broadcast to spectator namespace (called from authenticated handlers)
  function broadcastToSpectators(event: string, room: string, data: unknown): void {
    spectatorNs.to(room).emit(event, data);
  }

  // ── JWT Authentication Middleware (default namespace only) ──────────────────
  io.use((socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      if (!cookieHeader) {
        return next(new Error('Authentication required: no cookies'));
      }

      const cookies = parseCookie(cookieHeader);
      const token = cookies['auth_token'];
      if (!token) {
        return next(new Error('Authentication required: no auth_token cookie'));
      }

      const payload = verify(token, config.jwt.secret) as JwtPayload;
      socket.data = {
        userId: payload.sub,
        email: payload.email,
        roles: payload.roles,
      };

      next();
    } catch (err) {
      logger.warn({ err }, 'WebSocket auth failed');
      next(new Error('Authentication failed: invalid token'));
    }
  });

  // ── Connection Handler ─────────────────────────────────────────────────────
  io.on('connection', (socket: AuthenticatedSocket) => {
    const { userId, email, roles } = socket.data;
    logger.info({ userId, email, socketId: socket.id }, 'WebSocket connected');

    // ── Spectator: join match room ──────────────────────────────────────────
    socket.on('spectator:join', (data: { matchId: string }) => {
      if (!data.matchId) return;
      const room = `match:${data.matchId}`;
      socket.join(room);
      logger.info({ userId, matchId: data.matchId, room }, 'Spectator joined room');
    });

    socket.on('spectator:leave', (data: { matchId: string }) => {
      if (!data.matchId) return;
      socket.leave(`match:${data.matchId}`);
    });

    // ── Tournament: join tournament room for standings/results updates ───────
    socket.on('tournament:join', (data: { tournamentId: string }) => {
      if (!data.tournamentId) return;
      socket.join(`tournament:${data.tournamentId}`);
    });

    socket.on('tournament:leave', (data: { tournamentId: string }) => {
      if (!data.tournamentId) return;
      socket.leave(`tournament:${data.tournamentId}`);
    });

    // ── Broadcast: standings updated (emitted by referee when match ends) ───
    socket.on('standings:updated', (data: { tournamentId: string }) => {
      if (!data.tournamentId) return;
      // Broadcast to all in the tournament room (including sender)
      const payload = {
        tournamentId: data.tournamentId,
        timestamp: new Date().toISOString(),
      };
      io.to(`tournament:${data.tournamentId}`).emit('standings:refresh', payload);
      // Also broadcast to anonymous spectators
      broadcastToSpectators('standings:refresh', `tournament:${data.tournamentId}`, payload);
    });

    // ── Referee: join and lock match ────────────────────────────────────────
    socket.on('referee:join', (data: { matchId: string }, callback?: (res: { success: boolean; message?: string }) => void) => {
      if (!data.matchId) return;

      // Verify user has referee or admin role
      if (!roles.includes('referee') && !roles.includes('admin')) {
        callback?.({ success: false, message: 'Insufficient role: referee or admin required' });
        return;
      }

      const matchId = data.matchId;
      const existing = refereeLocks.get(matchId);

      // Check if match is already locked by another referee
      if (existing && existing.userId !== userId) {
        callback?.({ success: false, message: `Match is already controlled by another referee` });
        return;
      }

      // Lock the match to this referee
      refereeLocks.set(matchId, { socketId: socket.id, userId });
      const room = `match:${matchId}`;
      socket.join(room);

      logger.info({ userId, matchId, socketId: socket.id }, 'Referee took control of match');
      callback?.({ success: true });
    });

    socket.on('referee:leave', (data: { matchId: string }) => {
      if (!data.matchId) return;
      releaseLock(data.matchId, socket.id);
      socket.leave(`match:${data.matchId}`);
    });

    // ── Disconnect: release locks ───────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info({ userId, socketId: socket.id, reason }, 'WebSocket disconnected');
      // Release any match locks held by this socket
      for (const [matchId, lock] of refereeLocks) {
        if (lock.socketId === socket.id) {
          refereeLocks.delete(matchId);
          logger.info({ matchId, userId }, 'Referee lock released on disconnect');
        }
      }
    });

    // ── Chat handlers ───────────────────────────────────────────────────────
    registerChatHandlers(io, socket);
  });

  return io;
}

/**
 * Release a referee lock if the socket owns it.
 */
function releaseLock(matchId: string, socketId: string): void {
  const lock = refereeLocks.get(matchId);
  if (lock?.socketId === socketId) {
    refereeLocks.delete(matchId);
  }
}

/**
 * Get the Socket.IO server instance to use in event handlers.
 */
export function getRefereeLock(matchId: string): { socketId: string; userId: string } | undefined {
  return refereeLocks.get(matchId);
}

/** Reference to the spectator namespace for external broadcasting. */
let _spectatorNs: ReturnType<Server['of']> | null = null;

/**
 * Broadcasts an event to anonymous spectators in a specific room.
 * Use from match-handlers to push score updates to public viewers.
 */
export function broadcastToPublicSpectators(event: string, room: string, data: unknown): void {
  _spectatorNs?.to(room).emit(event, data);
}
