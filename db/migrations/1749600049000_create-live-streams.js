/**
 * Migration: live streaming module.
 *
 * Allows organizers to attach live stream URLs to matches.
 * Supports: YouTube Live, Facebook Live, Twitch, custom RTMP/HLS, or embed URL.
 *
 * The stream is displayed in the public match view when active.
 * This feature is plan-gated via the 'liveStreaming' feature flag.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('match_streams', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    match_id: {
      type: 'uuid',
      notNull: true,
      references: '"matches"',
      onDelete: 'CASCADE',
      comment: 'The match this stream belongs to',
    },
    platform: {
      type: 'varchar(30)',
      notNull: true,
      comment: 'Platform: youtube, facebook, twitch, custom',
    },
    stream_url: {
      type: 'varchar(500)',
      notNull: true,
      comment: 'Full URL of the stream (embed or watch URL)',
    },
    embed_url: {
      type: 'varchar(500)',
      comment: 'Direct embed URL (auto-generated from stream_url for known platforms)',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'scheduled'",
      comment: 'scheduled, live, ended',
    },
    started_at: {
      type: 'timestamptz',
      comment: 'When the stream went live',
    },
    ended_at: {
      type: 'timestamptz',
      comment: 'When the stream ended',
    },
    created_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('match_streams', 'chk_stream_platform',
    "CHECK (platform IN ('youtube', 'facebook', 'twitch', 'custom'))");
  pgm.addConstraint('match_streams', 'chk_stream_status',
    "CHECK (status IN ('scheduled', 'live', 'ended'))");
  pgm.createIndex('match_streams', 'match_id');
  pgm.createIndex('match_streams', ['status'], { where: "status = 'live'", name: 'idx_live_streams' });

  // Add liveStreaming feature to plans
  pgm.sql(`
    UPDATE subscription_plans SET features = features || '{"liveStreaming": false}'::jsonb
    WHERE NOT (features ? 'liveStreaming');
  `);
  pgm.sql(`
    UPDATE subscription_plans SET features = jsonb_set(features, '{liveStreaming}', 'true')
    WHERE slug = 'premium';
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('match_streams');
  pgm.sql(`
    UPDATE subscription_plans SET features = features - 'liveStreaming';
  `);
};
