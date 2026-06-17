-- ============================================================
-- SCRIPT: Reset completo + seed de datos de prueba
-- Ejecutar: Get-Content "db/seeds/reset-and-seed-all.sql" | docker exec -i tournament_postgres psql -U tournament_user -d tournament_platform
-- ============================================================
-- ADVERTENCIA: Este script BORRA todos los datos y los recrea.
-- Solo usar en desarrollo.
-- ============================================================

-- Paso 1: Ejecutar migraciones primero con:
--   cd db && DATABASE_URL=postgresql://tournament_user:change_me_in_production@localhost:5432/tournament_platform npx node-pg-migrate up --migrations-dir migrations

-- Paso 2: Ejecutar este script para datos de prueba

-- Limpiar datos (respetando FKs)
TRUNCATE team_members, tournament_staff, user_roles, users, volleyball_rotations, substitutions, match_periods, matches, standings, players, teams, phases, tournaments CASCADE;

-- ══════════════════════════════════════════════════════════════
-- DEPORTES (ya existen del seed de migraciones, re-insertar)
-- ══════════════════════════════════════════════════════════════
INSERT INTO sports (name, slug, players_per_team, has_sets, sets_to_win, points_per_set, decisive_set_points, win_margin, periods_per_match, max_substitutions, has_rotation, icon_url) VALUES
  ('Volleyball', 'volleyball', 6, TRUE, 3, 25, 15, 2, 5, 6, TRUE, 'https://img.icons8.com/color/96/volleyball.png'),
  ('Football', 'football', 11, FALSE, NULL, NULL, NULL, 2, 2, 5, FALSE, 'https://img.icons8.com/color/96/football2.png'),
  ('Basketball', 'basketball', 5, FALSE, NULL, NULL, NULL, 2, 4, NULL, FALSE, 'https://img.icons8.com/color/96/basketball.png'),
  ('Tennis', 'tennis', 1, TRUE, 2, 6, 6, 2, 3, 0, FALSE, 'https://img.icons8.com/color/96/tennis-ball.png')
ON CONFLICT (slug) DO UPDATE SET icon_url = EXCLUDED.icon_url;

-- ══════════════════════════════════════════════════════════════
-- ROLES (ya existen del seed de migraciones)
-- ══════════════════════════════════════════════════════════════
-- (roles se insertan en la migración, no necesitan re-seed)

-- ══════════════════════════════════════════════════════════════
-- USUARIOS
-- Password admin: admin123 | Password test: test123
-- ══════════════════════════════════════════════════════════════

-- Generar estos hashes con: node -e "require('bcrypt').hash('admin123',10).then(console.log)"
-- Por simplicidad usamos un placeholder que DEBE actualizarse con el script fix-passwords.js

INSERT INTO users (id, email, password_hash, name, document_number, phone) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@olimpic.app',      'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Administrador del Sistema', '0000000001', NULL),
  ('10000000-0000-0000-0000-000000000001', 'organizador@test.com',   'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Carlos Organizador',        '1001001001', '+57 310 100 1001'),
  ('10000000-0000-0000-0000-000000000002', 'entrenador@test.com',    'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Pedro Entrenador',          '1001001002', '+57 310 100 1002'),
  ('10000000-0000-0000-0000-000000000003', 'asistente@test.com',     'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Ana Asistente',             '1001001003', '+57 310 100 1003'),
  ('10000000-0000-0000-0000-000000000004', 'delegado@test.com',      'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Luis Delegado',             '1001001004', '+57 310 100 1004'),
  ('10000000-0000-0000-0000-000000000005', 'preparador@test.com',    'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Maria Preparadora',         '1001001005', '+57 310 100 1005'),
  ('10000000-0000-0000-0000-000000000006', 'coordinador@test.com',   'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Jorge Coordinador',         '1001001006', '+57 310 100 1006'),
  ('10000000-0000-0000-0000-000000000007', 'presidente@test.com',    'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Roberto Presidente',        '1001001007', '+57 310 100 1007'),
  ('10000000-0000-0000-0000-000000000008', 'jugador@test.com',       'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Diego Jugador',             '1001001008', '+57 310 100 1008'),
  ('10000000-0000-0000-0000-000000000009', 'padre@test.com',         'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Fernando Padre',            '1001001009', '+57 310 100 1009'),
  ('10000000-0000-0000-0000-000000000010', 'acompanante@test.com',   'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Sandra Acompanante',        '1001001010', '+57 310 100 1010'),
  ('10000000-0000-0000-0000-000000000011', 'arbitro@test.com',       'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Andres Arbitro',            '1001001011', '+57 310 100 1011'),
  ('10000000-0000-0000-0000-000000000012', 'veedor@test.com',        'PLACEHOLDER_RUN_FIX_PASSWORDS', 'Gloria Veedora',            '1001001012', '+57 310 100 1012');

INSERT INTO user_roles (user_id, role_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin'),
  ('10000000-0000-0000-0000-000000000001', 'organizer'),
  ('10000000-0000-0000-0000-000000000002', 'coach'),
  ('10000000-0000-0000-0000-000000000003', 'assistant'),
  ('10000000-0000-0000-0000-000000000004', 'delegate'),
  ('10000000-0000-0000-0000-000000000005', 'fitness_coach'),
  ('10000000-0000-0000-0000-000000000006', 'coordinator'),
  ('10000000-0000-0000-0000-000000000007', 'president'),
  ('10000000-0000-0000-0000-000000000008', 'player'),
  ('10000000-0000-0000-0000-000000000009', 'parent'),
  ('10000000-0000-0000-0000-000000000010', 'companion'),
  ('10000000-0000-0000-0000-000000000011', 'referee'),
  ('10000000-0000-0000-0000-000000000012', 'observer');

-- ══════════════════════════════════════════════════════════════
-- NOTA: Después de ejecutar este script, correr:
--   node db/seeds/fix-passwords.js
-- para generar los hashes bcrypt correctos.
-- ══════════════════════════════════════════════════════════════
