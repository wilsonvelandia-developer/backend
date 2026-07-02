/**
 * Migration: create chat_rooms and chat_messages tables
 *
 * Supports real-time messaging between organizers and teams.
 * Rooms can be scoped to a tournament, team, or be direct (1:1).
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('chat_rooms', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    type: {
      type: 'varchar(20)',
      notNull: true,
      comment: 'Room type: tournament, team, direct.',
    },
    name: {
      type: 'varchar(200)',
      notNull: true,
    },
    reference_id: {
      type: 'uuid',
      comment: 'FK to tournament or team depending on type. NULL for direct rooms.',
    },
    created_by: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('chat_rooms', 'chk_room_type',
    "CHECK (type IN ('tournament', 'team', 'direct'))");
  pgm.createIndex('chat_rooms', 'reference_id');
  pgm.createIndex('chat_rooms', 'type');

  // Room members — tracks which users belong to which rooms
  pgm.createTable('chat_room_members', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    room_id: {
      type: 'uuid',
      notNull: true,
      references: '"chat_rooms"',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    joined_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    last_read_at: {
      type: 'timestamptz',
      default: pgm.func('NOW()'),
      comment: 'Timestamp of the last message read by this member.',
    },
  });

  pgm.addConstraint('chat_room_members', 'uq_room_member',
    { unique: ['room_id', 'user_id'] });
  pgm.createIndex('chat_room_members', 'user_id');
  pgm.createIndex('chat_room_members', 'room_id');

  // Messages
  pgm.createTable('chat_messages', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    room_id: {
      type: 'uuid',
      notNull: true,
      references: '"chat_rooms"',
      onDelete: 'CASCADE',
    },
    sender_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    content: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('chat_messages', 'room_id');
  pgm.createIndex('chat_messages', ['room_id', 'created_at']);
  pgm.createIndex('chat_messages', 'sender_id');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('chat_messages');
  pgm.dropTable('chat_room_members');
  pgm.dropTable('chat_rooms');
};
