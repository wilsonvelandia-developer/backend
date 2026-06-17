-- ============================================================
-- SEED: Test users for all roles
-- Password for all: test123
-- ============================================================

BEGIN;

-- Hash for 'test123'
-- $2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu

-- ── Users ─────────────────────────────────────────────────────────────────────

INSERT INTO users (id, email, password_hash, name, document_number, phone) VALUES
  ('10000000-0000-0000-0000-000000000001', 'organizador@test.com',   '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'Carlos Organizador',    '1001001001', '+57 310 100 1001'),
  ('10000000-0000-0000-0000-000000000002', 'entrenador@test.com',    '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'Pedro Entrenador',      '1001001002', '+57 310 100 1002'),
  ('10000000-0000-0000-0000-000000000003', 'asistente@test.com',     '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'Ana Asistente',         '1001001003', '+57 310 100 1003'),
  ('10000000-0000-0000-0000-000000000004', 'delegado@test.com',      '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'Luis Delegado',         '1001001004', '+57 310 100 1004'),
  ('10000000-0000-0000-0000-000000000005', 'preparador@test.com',    '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'María Preparadora',     '1001001005', '+57 310 100 1005'),
  ('10000000-0000-0000-0000-000000000006', 'coordinador@test.com',   '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'Jorge Coordinador',     '1001001006', '+57 310 100 1006'),
  ('10000000-0000-0000-0000-000000000007', 'presidente@test.com',    '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'Roberto Presidente',    '1001001007', '+57 310 100 1007'),
  ('10000000-0000-0000-0000-000000000008', 'jugador@test.com',       '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'Diego Jugador',         '1001001008', '+57 310 100 1008'),
  ('10000000-0000-0000-0000-000000000009', 'padre@test.com',         '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'Fernando Padre',        '1001001009', '+57 310 100 1009'),
  ('10000000-0000-0000-0000-000000000010', 'acompanante@test.com',   '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'Sandra Acompañante',    '1001001010', '+57 310 100 1010'),
  ('10000000-0000-0000-0000-000000000011', 'arbitro@test.com',       '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'Andrés Árbitro',        '1001001011', '+57 310 100 1011'),
  ('10000000-0000-0000-0000-000000000012', 'veedor@test.com',        '$2b$10$J.CP8zGBpRshCy/ci3Ra1.bVXk3va7l21faOp842p.PBT3ojt/PHu', 'Gloria Veedora',        '1001001012', '+57 310 100 1012')
ON CONFLICT (email) DO NOTHING;

-- ── Assign roles ──────────────────────────────────────────────────────────────

INSERT INTO user_roles (user_id, role_id) VALUES
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
  ('10000000-0000-0000-0000-000000000012', 'observer')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ── Tournament Staff (organizer + referee + observer → Copa Olímpica) ─────────

INSERT INTO tournament_staff (user_id, tournament_id, staff_role) VALUES
  -- Organizador es staff de la Copa Olímpica
  ('10000000-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0000-0000-000000000000', 'organizer'),
  -- Árbitro asignado a la Copa Olímpica
  ('10000000-0000-0000-0000-000000000011', 'a1b2c3d4-0001-0000-0000-000000000000', 'referee'),
  -- Veedor asignado a la Copa Olímpica
  ('10000000-0000-0000-0000-000000000012', 'a1b2c3d4-0001-0000-0000-000000000000', 'observer')
ON CONFLICT (user_id, tournament_id, staff_role) DO NOTHING;

-- ── Team Members (coach, player, etc. → Equipo GA1 de Copa Olímpica) ──────────

INSERT INTO team_members (user_id, team_id, member_role, jersey_number, position) VALUES
  -- Entrenador del Grupo A Equipo 1
  ('10000000-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000001', 'coach',         NULL,  NULL),
  -- Asistente del Grupo A Equipo 1
  ('10000000-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000001', 'assistant',     NULL,  NULL),
  -- Delegado del Grupo A Equipo 1
  ('10000000-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000001', 'delegate',      NULL,  NULL),
  -- Preparador físico del Grupo A Equipo 1
  ('10000000-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000001', 'fitness_coach', NULL,  NULL),
  -- Coordinador del Grupo A Equipo 1
  ('10000000-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000001', 'coordinator',   NULL,  NULL),
  -- Presidente del Grupo A Equipo 1
  ('10000000-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000001', 'president',     NULL,  NULL),
  -- Jugador #10 del Grupo A Equipo 1
  ('10000000-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000001', 'player',        10,    'setter'),
  -- Padre de familia asociado al equipo
  ('10000000-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000001', 'parent',        NULL,  NULL),
  -- Acompañante asociado al equipo
  ('10000000-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000001', 'companion',     NULL,  NULL)
ON CONFLICT (user_id, team_id, member_role) DO NOTHING;

-- ── Also add coach to a second team (demonstrates multi-team membership) ──────

INSERT INTO team_members (user_id, team_id, member_role) VALUES
  -- Entrenador también es coach del Grupo B Equipo 1
  ('10000000-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000005', 'coach')
ON CONFLICT (user_id, team_id, member_role) DO NOTHING;

-- ── Also add organizer to a second tournament ─────────────────────────────────

INSERT INTO tournament_staff (user_id, tournament_id, staff_role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'd81ab4e8-3751-49e4-8fd7-0196086d09b5', 'organizer')
ON CONFLICT (user_id, tournament_id, staff_role) DO NOTHING;

COMMIT;

-- Verification
SELECT u.name, u.email, array_agg(ur.role_id) AS roles
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE u.id LIKE '10000000%'
GROUP BY u.id
ORDER BY u.name;
