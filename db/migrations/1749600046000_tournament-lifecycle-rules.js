/**
 * Migration: tournament lifecycle rules.
 *
 * Adds configurable windows for enrollment, player changes, and archiving:
 *
 * - player_change_deadline: fecha límite para agregar/cambiar jugadores (null = sin límite)
 * - player_change_max_matchday: jornada máxima hasta la que se permiten cambios (null = sin límite)
 * - archive_after_days: días después de finalizado en que el torneo se oculta (null = nunca)
 *
 * Also adds enrollment_closed_at to track when enrollment was explicitly closed.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('tournaments', {
    player_change_deadline: {
      type: 'timestamptz',
      comment: 'Last date/time to add or change players. NULL = follows tournament status rules only.',
    },
    player_change_max_matchday: {
      type: 'integer',
      comment: 'Maximum matchday (jornada) number until which player changes are allowed. NULL = no matchday limit.',
    },
    archive_after_days: {
      type: 'integer',
      default: 90,
      comment: 'Days after tournament finishes before it becomes archived/hidden. NULL = never archive.',
    },
    enrollment_closed_at: {
      type: 'timestamptz',
      comment: 'When enrollment was explicitly closed (independent of status). NULL = not closed yet.',
    },
  });

  pgm.addConstraint('tournaments', 'chk_player_change_matchday',
    'CHECK (player_change_max_matchday IS NULL OR player_change_max_matchday >= 1)');
  pgm.addConstraint('tournaments', 'chk_archive_days',
    'CHECK (archive_after_days IS NULL OR archive_after_days >= 1)');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropConstraint('tournaments', 'chk_archive_days');
  pgm.dropConstraint('tournaments', 'chk_player_change_matchday');
  pgm.dropColumns('tournaments', [
    'player_change_deadline', 'player_change_max_matchday',
    'archive_after_days', 'enrollment_closed_at',
  ]);
};
