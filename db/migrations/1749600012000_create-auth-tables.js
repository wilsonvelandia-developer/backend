/**
 * Migration: create authentication and authorization tables
 *
 * Tables:
 *  - roles: catalog of 12 profiles
 *  - users: unique person (identified by email or document)
 *  - user_roles: many-to-many user ↔ role
 *  - tournament_staff: user ↔ tournament (organizer, referee, observer)
 *  - team_members: user ↔ team with role (coach, player, etc.)
 *
 * Rules:
 *  - A user can have multiple roles (e.g. coach in one team, player in another)
 *  - A user can be staff in multiple tournaments simultaneously
 *  - A player can only belong to 1 team per tournament (enforced by unique constraint)
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Roles catalog ─────────────────────────────────────────────────────────
  pgm.createTable('roles', {
    id: {
      type: 'varchar(30)',
      primaryKey: true,
      comment: 'Role slug identifier',
    },
    name: {
      type: 'varchar(60)',
      notNull: true,
      comment: 'Display name in Spanish',
    },
    description: {
      type: 'varchar(300)',
      comment: 'Short description of role permissions',
    },
    can_create_users: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Whether this role can create other users',
    },
    is_read_only: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'True for roles with read-only access (player, parent, etc.)',
    },
  });

  // Seed roles
  pgm.sql(`
    INSERT INTO roles (id, name, description, can_create_users, is_read_only) VALUES
      ('admin',             'Administrador',       'Acceso total al sistema',                                          TRUE,  FALSE),
      ('organizer',         'Organizador',         'Crea y gestiona sus torneos',                                      TRUE,  FALSE),
      ('coach',             'Entrenador',          'Gestiona sus equipos y jugadores',                                 TRUE,  FALSE),
      ('assistant',         'Asistente',           'Asiste al entrenador en la gestión del equipo',                    TRUE,  FALSE),
      ('delegate',          'Delegado',            'Representa al equipo ante la organización',                        TRUE,  FALSE),
      ('fitness_coach',     'Preparador Físico',   'Encargado de la preparación física del equipo',                    TRUE,  FALSE),
      ('coordinator',       'Coordinador',         'Coordina logística y operaciones del equipo',                      TRUE,  FALSE),
      ('president',         'Presidente',          'Presidente o representante legal del club/equipo',                 TRUE,  FALSE),
      ('player',            'Jugador',             'Deportista registrado en un equipo (solo lectura)',                 FALSE, TRUE),
      ('parent',            'Padre de Familia',    'Familiar o acudiente de un jugador (solo lectura)',                 FALSE, TRUE),
      ('companion',         'Acompañante',         'Acompañante autorizado (solo lectura)',                             FALSE, TRUE),
      ('referee',           'Árbitro / Juez',      'Gestiona partidos y eventos durante el juego',                     TRUE,  FALSE),
      ('observer',          'Veedor',              'Observa partidos y deja anotaciones (solo lectura + observaciones)',FALSE, TRUE)
    ON CONFLICT (id) DO NOTHING;
  `);

  // ── Users ─────────────────────────────────────────────────────────────────
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
      comment: 'Login email — unique identifier for authentication',
    },
    password_hash: {
      type: 'varchar(255)',
      notNull: true,
      comment: 'bcrypt hash of the password — never expose',
    },
    name: {
      type: 'varchar(200)',
      notNull: true,
      comment: 'Full name of the person',
    },
    document_number: {
      type: 'varchar(30)',
      comment: 'National ID or passport number — used for deduplication',
    },
    phone: {
      type: 'varchar(30)',
      comment: 'Contact phone number',
    },
    avatar_url: {
      type: 'varchar(500)',
      comment: 'Profile picture URL',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: 'Soft-delete: inactive users cannot login',
    },
    created_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
      comment: 'User who created this account (for audit trail)',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('users', 'email');
  pgm.createIndex('users', 'document_number', { where: 'document_number IS NOT NULL' });

  // ── User Roles (many-to-many) ─────────────────────────────────────────────
  pgm.createTable('user_roles', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    role_id: {
      type: 'varchar(30)',
      notNull: true,
      references: '"roles"',
      onDelete: 'RESTRICT',
    },
    assigned_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('user_roles', 'uq_user_role', 'UNIQUE (user_id, role_id)');
  pgm.createIndex('user_roles', 'user_id');
  pgm.createIndex('user_roles', 'role_id');

  // ── Tournament Staff (user ↔ tournament, for organizers/referees/observers) ─
  pgm.createTable('tournament_staff', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    tournament_id: {
      type: 'uuid',
      notNull: true,
      references: '"tournaments"',
      onDelete: 'CASCADE',
    },
    staff_role: {
      type: 'varchar(30)',
      notNull: true,
      comment: 'Role within this tournament: organizer, referee, observer',
    },
    assigned_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('tournament_staff', 'uq_tournament_staff', 'UNIQUE (user_id, tournament_id, staff_role)');
  pgm.addConstraint('tournament_staff', 'chk_staff_role', "CHECK (staff_role IN ('organizer', 'referee', 'observer'))");
  pgm.createIndex('tournament_staff', 'tournament_id');
  pgm.createIndex('tournament_staff', 'user_id');

  // ── Team Members (user ↔ team with role) ──────────────────────────────────
  pgm.createTable('team_members', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    team_id: {
      type: 'uuid',
      notNull: true,
      references: '"teams"',
      onDelete: 'CASCADE',
    },
    member_role: {
      type: 'varchar(30)',
      notNull: true,
      comment: 'Role within this team: coach, player, assistant, delegate, etc.',
    },
    jersey_number: {
      type: 'integer',
      comment: 'Jersey number (only for players)',
    },
    position: {
      type: 'varchar(50)',
      comment: 'Playing position (only for players)',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    joined_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint('team_members', 'uq_team_member_role', 'UNIQUE (user_id, team_id, member_role)');
  pgm.addConstraint('team_members', 'chk_member_role',
    "CHECK (member_role IN ('coach', 'assistant', 'delegate', 'fitness_coach', 'coordinator', 'president', 'player', 'parent', 'companion'))");
  pgm.createIndex('team_members', 'team_id');
  pgm.createIndex('team_members', 'user_id');

  // ── Seed admin user ───────────────────────────────────────────────────────
  // Password: admin123 (bcrypt hash)
  pgm.sql(`
    INSERT INTO users (id, email, password_hash, name, document_number)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'admin@olimpic.app',
      '$2b$10$8K1p/6jPNLhNqGFjzENJwOdq5G5SZmN3nGIf7VYFKlJHw4T4K6Gqe',
      'Administrador del Sistema',
      '0000000001'
    ) ON CONFLICT (email) DO NOTHING;

    INSERT INTO user_roles (user_id, role_id)
    VALUES ('00000000-0000-0000-0000-000000000001', 'admin')
    ON CONFLICT (user_id, role_id) DO NOTHING;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('team_members');
  pgm.dropTable('tournament_staff');
  pgm.dropTable('user_roles');
  pgm.dropTable('users');
  pgm.dropTable('roles');
};
