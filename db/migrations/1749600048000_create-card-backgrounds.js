/**
 * Migration: card background templates for social media image generation.
 *
 * Admins upload background images that serve as the base layer for generated cards.
 * Each background is categorized by card type (mvp, welcome, credential, result, standings, fixture).
 * When generating a card, a random background from the matching category is selected.
 *
 * If no backgrounds are configured, the cards use their default CSS gradients.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('card_backgrounds', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    card_type: {
      type: 'varchar(30)',
      notNull: true,
      comment: 'Card type: mvp, welcome, credential, result, standings, fixture, all',
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Descriptive name for admin reference',
    },
    image_url: {
      type: 'varchar(500)',
      notNull: true,
      comment: 'URL of the background image (1080x1920 recommended)',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    display_order: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('card_backgrounds', 'chk_card_type',
    "CHECK (card_type IN ('mvp', 'welcome', 'credential', 'result', 'standings', 'fixture', 'all'))");
  pgm.createIndex('card_backgrounds', ['card_type', 'is_active']);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('card_backgrounds');
};
