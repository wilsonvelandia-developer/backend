/**
 * Migration: add club_name to teams for club-based group separation.
 *
 * When a club (e.g., "Club Deportivo Juventud CEDIJ") registers multiple teams
 * in the same tournament (e.g., "CEDIJ Negro", "CEDIJ Blanco", "CEDIJ Dorado"),
 * the `club_name` field identifies them as belonging to the same organization.
 *
 * The auto-draw algorithm uses this field to ensure teams from the same club
 * are placed in different groups during the first phase (group stage).
 *
 * Also adds `enforce_club_separation` to tournaments to toggle this feature.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Add club_name to teams
  pgm.addColumn('teams', {
    club_name: {
      type: 'varchar(200)',
      comment: 'Club/organization name. Teams with the same club_name are from the same club and should not be in the same group.',
    },
  });

  pgm.createIndex('teams', 'club_name', {
    where: 'club_name IS NOT NULL',
    name: 'idx_teams_club_name',
  });

  // Add tournament config for club separation
  pgm.addColumn('tournaments', {
    enforce_club_separation: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: 'When true, auto-draw ensures teams from the same club go to different groups. Manual draw shows a warning but does not block.',
    },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumn('tournaments', 'enforce_club_separation');
  pgm.dropIndex('teams', [], { name: 'idx_teams_club_name' });
  pgm.dropColumn('teams', 'club_name');
};
