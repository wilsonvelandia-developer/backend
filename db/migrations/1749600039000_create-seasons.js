/**
 * Migration: create seasons table for historical tournament grouping.
 *
 * A season groups tournaments that occur within a time period (e.g. "2026-A", "Copa Navideña 2025").
 * This enables year-over-year statistics, archived tournament browsing, and cleaner organization.
 *
 * Changes:
 *  - Creates `seasons` table
 *  - Adds `season_id` FK to `tournaments` (nullable — existing tournaments remain unlinked)
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable('seasons', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Display name (e.g. "Temporada 2026-A", "Copa Navideña 2025")',
    },
    slug: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
      comment: 'URL-safe identifier (e.g. "2026-a", "copa-navidad-2025")',
    },
    start_date: {
      type: 'date',
      comment: 'Start date of the season',
    },
    end_date: {
      type: 'date',
      comment: 'End date of the season',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: 'Whether this season is currently active for registration/scheduling',
    },
    description: {
      type: 'varchar(500)',
      comment: 'Optional description of the season',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('seasons', 'slug');
  pgm.createIndex('seasons', 'is_active');

  // Add FK column to tournaments
  pgm.addColumn('tournaments', {
    season_id: {
      type: 'uuid',
      references: '"seasons"',
      onDelete: 'SET NULL',
      comment: 'Optional link to a season for historical grouping',
    },
  });

  pgm.createIndex('tournaments', 'season_id', {
    where: 'season_id IS NOT NULL',
    name: 'idx_tournaments_season',
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex('tournaments', [], { name: 'idx_tournaments_season' });
  pgm.dropColumn('tournaments', 'season_id');
  pgm.dropTable('seasons');
};
