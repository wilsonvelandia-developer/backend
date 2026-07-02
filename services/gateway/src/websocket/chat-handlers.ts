import { Pool } from 'pg';
import { Server } from 'socket.io';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { AuthenticatedSocket } from './socket-server.js';

const pool = new Pool({ connectionString: config.db.connectionString });

interface ChatRoom {
  id: string;
  name: string;
  type: string;
  lastMessage: string | null;
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
}

/**
 * Registers chat event handlers on the given socket.
 * Handles: chat:join, chat:openRoom, chat:sendMessage, chat:createRoom.
 */
export function registerChatHandlers(io: Server, socket: AuthenticatedSocket): void {
  const { userId } = socket.data;

  // ── chat:join — load user's rooms ─────────────────────────────────────────
  socket.on('chat:join', async () => {
    try {
      const rooms = await getUserRooms(userId);
      socket.emit('chat:rooms', rooms);

      // Join all Socket.IO rooms for real-time delivery
      for (const room of rooms) {
        socket.join(`chat:${room.id}`);
      }
    } catch (err) {
      logger.error({ err, userId }, 'Error loading chat rooms');
    }
  });

  // ── chat:openRoom — load messages for a room ──────────────────────────────
  socket.on('chat:openRoom', async (data: { roomId: string }) => {
    if (!data.roomId) return;
    try {
      const messages = await getRoomMessages(data.roomId);
      socket.emit('chat:messages', messages);

      // Update last_read_at for this member
      await pool.query(
        `UPDATE chat_room_members SET last_read_at = NOW()
         WHERE room_id = $1 AND user_id = $2`,
        [data.roomId, userId],
      );
    } catch (err) {
      logger.error({ err, userId, roomId: data.roomId }, 'Error loading chat messages');
    }
  });

  // ── chat:sendMessage — persist and broadcast ──────────────────────────────
  socket.on('chat:sendMessage', async (data: { roomId: string; content: string }) => {
    if (!data.roomId || !data.content?.trim()) return;
    try {
      const content = data.content.trim().slice(0, 1000);

      // Insert message
      const result = await pool.query<{ id: string; created_at: Date }>(
        `INSERT INTO chat_messages (room_id, sender_id, content)
         VALUES ($1, $2, $3) RETURNING id, created_at`,
        [data.roomId, userId, content],
      );

      // Get sender name
      const userResult = await pool.query<{ name: string }>(
        `SELECT name FROM users WHERE id = $1`,
        [userId],
      );
      const senderName = userResult.rows[0]?.name ?? 'Usuario';

      const message: ChatMessage = {
        id: result.rows[0].id,
        roomId: data.roomId,
        senderId: userId,
        senderName,
        content,
        timestamp: result.rows[0].created_at.toISOString(),
      };

      // Broadcast to all members in the room
      io.to(`chat:${data.roomId}`).emit('chat:newMessage', message);
    } catch (err) {
      logger.error({ err, userId, roomId: data.roomId }, 'Error sending chat message');
    }
  });

  // ── chat:createRoom — create a new chat room ──────────────────────────────
  socket.on('chat:createRoom', async (data: { type: string; referenceId?: string; name: string }) => {
    if (!data.name?.trim() || !data.type) return;
    try {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO chat_rooms (type, name, reference_id, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [data.type, data.name.trim(), data.referenceId ?? null, userId],
      );
      const roomId = result.rows[0].id;

      // Add creator as member
      await pool.query(
        `INSERT INTO chat_room_members (room_id, user_id) VALUES ($1, $2)`,
        [roomId, userId],
      );

      // Join the Socket.IO room
      socket.join(`chat:${roomId}`);

      // Refresh rooms list for the user
      const rooms = await getUserRooms(userId);
      socket.emit('chat:rooms', rooms);
    } catch (err) {
      logger.error({ err, userId }, 'Error creating chat room');
    }
  });
}

// ── Database helpers ──────────────────────────────────────────────────────────

async function getUserRooms(userId: string): Promise<ChatRoom[]> {
  const result = await pool.query<{
    id: string; name: string; type: string;
    last_message: string | null; unread_count: string;
  }>(
    `SELECT cr.id, cr.name, cr.type,
            (SELECT content FROM chat_messages cm
             WHERE cm.room_id = cr.id ORDER BY cm.created_at DESC LIMIT 1) AS last_message,
            (SELECT COUNT(*)::int FROM chat_messages cm
             WHERE cm.room_id = cr.id
             AND cm.created_at > COALESCE(crm.last_read_at, '1970-01-01'::timestamptz)
             AND cm.sender_id != $1) AS unread_count
     FROM chat_rooms cr
     JOIN chat_room_members crm ON crm.room_id = cr.id
     WHERE crm.user_id = $1
     ORDER BY (SELECT MAX(created_at) FROM chat_messages WHERE room_id = cr.id) DESC NULLS LAST`,
    [userId],
  );

  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    lastMessage: r.last_message,
    unreadCount: parseInt(r.unread_count ?? '0', 10),
  }));
}

async function getRoomMessages(roomId: string): Promise<ChatMessage[]> {
  const result = await pool.query<{
    id: string; room_id: string; sender_id: string;
    sender_name: string; content: string; created_at: Date;
  }>(
    `SELECT cm.id, cm.room_id, cm.sender_id, u.name AS sender_name,
            cm.content, cm.created_at
     FROM chat_messages cm
     JOIN users u ON u.id = cm.sender_id
     WHERE cm.room_id = $1
     ORDER BY cm.created_at ASC
     LIMIT 100`,
    [roomId],
  );

  return result.rows.map((r) => ({
    id: r.id,
    roomId: r.room_id,
    senderId: r.sender_id,
    senderName: r.sender_name,
    content: r.content,
    timestamp: r.created_at.toISOString(),
  }));
}
