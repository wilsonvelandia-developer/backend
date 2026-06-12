-- ============================================================
-- SEED: Torneo Completo Copa Olímpica 2026 — Voleibol
-- ============================================================
-- Estructura:
--   FASE 1 — Grupos (round_robin)
--     Grupo A: 4 equipos, todos vs todos (6 partidos)
--     Grupo B: 4 equipos, todos vs todos (6 partidos)
--
--   FASE 2 — Copa Oro: Semifinales (1A vs 2B  |  1B vs 2A)
--   FASE 3 — Copa Oro: Final y 3er puesto
--             Campeón/Subcampeón Oro: ganadores semifinal
--             3er/4to Oro: perdedores semifinal
--
--   FASE 4 — Copa Plata: Semifinales (3A vs 4B  |  3B vs 4A)
--   FASE 5 — Copa Plata: Final y 3er puesto
--             Campeón/Subcampeón Plata: ganadores semifinal
--             3er/4to Plata: perdedores semifinal
--
-- Nota: las fases 2-5 tienen partidos con equipos TBD (por definir).
--       Los homeTeamId/awayTeamId se actualizarán después de
--       calcular los standings de la Fase 1.
-- ============================================================

BEGIN;

-- ── Variables de trabajo (UUIDs fijos para reproducibilidad) ──────────────────

-- IDs del torneo y fases
\set tournament_id  '\'a1b2c3d4-0001-0000-0000-000000000000\''
\set phase_grupos   '\'a1b2c3d4-0002-0000-0000-000000000000\''
\set phase_sf_oro   '\'a1b2c3d4-0003-0000-0000-000000000000\''
\set phase_final_oro '\'a1b2c3d4-0004-0000-0000-000000000000\''
\set phase_sf_plata  '\'a1b2c3d4-0005-0000-0000-000000000000\''
\set phase_final_plata '\'a1b2c3d4-0006-0000-0000-000000000000\''

-- IDs equipos Grupo A
\set team_a1 '\'b0000001-0000-0000-0000-000000000001\''
\set team_a2 '\'b0000001-0000-0000-0000-000000000002\''
\set team_a3 '\'b0000001-0000-0000-0000-000000000003\''
\set team_a4 '\'b0000001-0000-0000-0000-000000000004\''

-- IDs equipos Grupo B
\set team_b1 '\'b0000001-0000-0000-0000-000000000005\''
\set team_b2 '\'b0000001-0000-0000-0000-000000000006\''
\set team_b3 '\'b0000001-0000-0000-0000-000000000007\''
\set team_b4 '\'b0000001-0000-0000-0000-000000000008\''

-- ── Torneo ────────────────────────────────────────────────────────────────────

INSERT INTO tournaments (id, sport_id, name, season, status)
VALUES (
  'a1b2c3d4-0001-0000-0000-000000000000',
  'edb13f17-6eca-4153-bce1-62f42620a077',  -- volleyball
  'Copa Olímpica 2026 — Voleibol',
  '2026',
  'active'
);

-- ── Fases ─────────────────────────────────────────────────────────────────────

INSERT INTO phases (id, tournament_id, name, format, order_index, status) VALUES
  ('a1b2c3d4-0002-0000-0000-000000000000', 'a1b2c3d4-0001-0000-0000-000000000000',
   'Fase de Grupos',             'groups',       1, 'active'),

  ('a1b2c3d4-0003-0000-0000-000000000000', 'a1b2c3d4-0001-0000-0000-000000000000',
   'Copa Oro — Semifinales',     'single_elim',  2, 'pending'),

  ('a1b2c3d4-0004-0000-0000-000000000000', 'a1b2c3d4-0001-0000-0000-000000000000',
   'Copa Oro — Final',           'single_elim',  3, 'pending'),

  ('a1b2c3d4-0005-0000-0000-000000000000', 'a1b2c3d4-0001-0000-0000-000000000000',
   'Copa Plata — Semifinales',   'single_elim',  4, 'pending'),

  ('a1b2c3d4-0006-0000-0000-000000000000', 'a1b2c3d4-0001-0000-0000-000000000000',
   'Copa Plata — Final',         'single_elim',  5, 'pending');

-- ── Equipos ───────────────────────────────────────────────────────────────────
-- Grupo A

INSERT INTO teams (id, tournament_id, name, short_name) VALUES
  ('b0000001-0000-0000-0000-000000000001', 'a1b2c3d4-0001-0000-0000-000000000000', 'Grupo A — Equipo 1', 'GA1'),
  ('b0000001-0000-0000-0000-000000000002', 'a1b2c3d4-0001-0000-0000-000000000000', 'Grupo A — Equipo 2', 'GA2'),
  ('b0000001-0000-0000-0000-000000000003', 'a1b2c3d4-0001-0000-0000-000000000000', 'Grupo A — Equipo 3', 'GA3'),
  ('b0000001-0000-0000-0000-000000000004', 'a1b2c3d4-0001-0000-0000-000000000000', 'Grupo A — Equipo 4', 'GA4');

-- Grupo B
INSERT INTO teams (id, tournament_id, name, short_name) VALUES
  ('b0000001-0000-0000-0000-000000000005', 'a1b2c3d4-0001-0000-0000-000000000000', 'Grupo B — Equipo 1', 'GB1'),
  ('b0000001-0000-0000-0000-000000000006', 'a1b2c3d4-0001-0000-0000-000000000000', 'Grupo B — Equipo 2', 'GB2'),
  ('b0000001-0000-0000-0000-000000000007', 'a1b2c3d4-0001-0000-0000-000000000000', 'Grupo B — Equipo 3', 'GB3'),
  ('b0000001-0000-0000-0000-000000000008', 'a1b2c3d4-0001-0000-0000-000000000000', 'Grupo B — Equipo 4', 'GB4');

-- ── Jugadores (6 por equipo, posiciones de voleibol) ─────────────────────────

-- Macro para insertar jugadores de un equipo
-- Equipo GA1
INSERT INTO players (team_id, name, jersey_number, position) VALUES
  ('b0000001-0000-0000-0000-000000000001', 'Jugador GA1-01', 1,  'setter'),
  ('b0000001-0000-0000-0000-000000000001', 'Jugador GA1-02', 2,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000001', 'Jugador GA1-03', 3,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000001', 'Jugador GA1-04', 4,  'opposite'),
  ('b0000001-0000-0000-0000-000000000001', 'Jugador GA1-05', 5,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000001', 'Jugador GA1-06', 6,  'libero'),
  ('b0000001-0000-0000-0000-000000000001', 'Jugador GA1-07', 7,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000001', 'Jugador GA1-08', 8,  'outside_hitter');

-- Equipo GA2
INSERT INTO players (team_id, name, jersey_number, position) VALUES
  ('b0000001-0000-0000-0000-000000000002', 'Jugador GA2-01', 1,  'setter'),
  ('b0000001-0000-0000-0000-000000000002', 'Jugador GA2-02', 2,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000002', 'Jugador GA2-03', 3,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000002', 'Jugador GA2-04', 4,  'opposite'),
  ('b0000001-0000-0000-0000-000000000002', 'Jugador GA2-05', 5,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000002', 'Jugador GA2-06', 6,  'libero'),
  ('b0000001-0000-0000-0000-000000000002', 'Jugador GA2-07', 7,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000002', 'Jugador GA2-08', 8,  'outside_hitter');

-- Equipo GA3
INSERT INTO players (team_id, name, jersey_number, position) VALUES
  ('b0000001-0000-0000-0000-000000000003', 'Jugador GA3-01', 1,  'setter'),
  ('b0000001-0000-0000-0000-000000000003', 'Jugador GA3-02', 2,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000003', 'Jugador GA3-03', 3,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000003', 'Jugador GA3-04', 4,  'opposite'),
  ('b0000001-0000-0000-0000-000000000003', 'Jugador GA3-05', 5,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000003', 'Jugador GA3-06', 6,  'libero'),
  ('b0000001-0000-0000-0000-000000000003', 'Jugador GA3-07', 7,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000003', 'Jugador GA3-08', 8,  'outside_hitter');

-- Equipo GA4
INSERT INTO players (team_id, name, jersey_number, position) VALUES
  ('b0000001-0000-0000-0000-000000000004', 'Jugador GA4-01', 1,  'setter'),
  ('b0000001-0000-0000-0000-000000000004', 'Jugador GA4-02', 2,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000004', 'Jugador GA4-03', 3,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000004', 'Jugador GA4-04', 4,  'opposite'),
  ('b0000001-0000-0000-0000-000000000004', 'Jugador GA4-05', 5,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000004', 'Jugador GA4-06', 6,  'libero'),
  ('b0000001-0000-0000-0000-000000000004', 'Jugador GA4-07', 7,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000004', 'Jugador GA4-08', 8,  'outside_hitter');

-- Equipo GB1
INSERT INTO players (team_id, name, jersey_number, position) VALUES
  ('b0000001-0000-0000-0000-000000000005', 'Jugador GB1-01', 1,  'setter'),
  ('b0000001-0000-0000-0000-000000000005', 'Jugador GB1-02', 2,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000005', 'Jugador GB1-03', 3,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000005', 'Jugador GB1-04', 4,  'opposite'),
  ('b0000001-0000-0000-0000-000000000005', 'Jugador GB1-05', 5,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000005', 'Jugador GB1-06', 6,  'libero'),
  ('b0000001-0000-0000-0000-000000000005', 'Jugador GB1-07', 7,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000005', 'Jugador GB1-08', 8,  'outside_hitter');

-- Equipo GB2
INSERT INTO players (team_id, name, jersey_number, position) VALUES
  ('b0000001-0000-0000-0000-000000000006', 'Jugador GB2-01', 1,  'setter'),
  ('b0000001-0000-0000-0000-000000000006', 'Jugador GB2-02', 2,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000006', 'Jugador GB2-03', 3,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000006', 'Jugador GB2-04', 4,  'opposite'),
  ('b0000001-0000-0000-0000-000000000006', 'Jugador GB2-05', 5,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000006', 'Jugador GB2-06', 6,  'libero'),
  ('b0000001-0000-0000-0000-000000000006', 'Jugador GB2-07', 7,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000006', 'Jugador GB2-08', 8,  'outside_hitter');

-- Equipo GB3
INSERT INTO players (team_id, name, jersey_number, position) VALUES
  ('b0000001-0000-0000-0000-000000000007', 'Jugador GB3-01', 1,  'setter'),
  ('b0000001-0000-0000-0000-000000000007', 'Jugador GB3-02', 2,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000007', 'Jugador GB3-03', 3,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000007', 'Jugador GB3-04', 4,  'opposite'),
  ('b0000001-0000-0000-0000-000000000007', 'Jugador GB3-05', 5,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000007', 'Jugador GB3-06', 6,  'libero'),
  ('b0000001-0000-0000-0000-000000000007', 'Jugador GB3-07', 7,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000007', 'Jugador GB3-08', 8,  'outside_hitter');

-- Equipo GB4
INSERT INTO players (team_id, name, jersey_number, position) VALUES
  ('b0000001-0000-0000-0000-000000000008', 'Jugador GB4-01', 1,  'setter'),
  ('b0000001-0000-0000-0000-000000000008', 'Jugador GB4-02', 2,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000008', 'Jugador GB4-03', 3,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000008', 'Jugador GB4-04', 4,  'opposite'),
  ('b0000001-0000-0000-0000-000000000008', 'Jugador GB4-05', 5,  'outside_hitter'),
  ('b0000001-0000-0000-0000-000000000008', 'Jugador GB4-06', 6,  'libero'),
  ('b0000001-0000-0000-0000-000000000008', 'Jugador GB4-07', 7,  'middle_blocker'),
  ('b0000001-0000-0000-0000-000000000008', 'Jugador GB4-08', 8,  'outside_hitter');

-- ── Standings iniciales (una fila por equipo en la fase de grupos) ─────────────

INSERT INTO standings (phase_id, team_id) VALUES
  ('a1b2c3d4-0002-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000001'),
  ('a1b2c3d4-0002-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000002'),
  ('a1b2c3d4-0002-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000003'),
  ('a1b2c3d4-0002-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000004'),
  ('a1b2c3d4-0002-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000005'),
  ('a1b2c3d4-0002-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000006'),
  ('a1b2c3d4-0002-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000007'),
  ('a1b2c3d4-0002-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000008');

-- ── Partidos FASE 1 — Grupo A (todos vs todos: C(4,2) = 6 partidos) ───────────
--  GA1 vs GA2
--  GA1 vs GA3
--  GA1 vs GA4
--  GA2 vs GA3
--  GA2 vs GA4
--  GA3 vs GA4

INSERT INTO matches (id, phase_id, home_team_id, away_team_id, scheduled_at) VALUES
  ('c0000001-0001-0000-0000-000000000001',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000001',
   'b0000001-0000-0000-0000-000000000002',
   '2026-07-01 09:00:00+00'),

  ('c0000001-0001-0000-0000-000000000002',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000001',
   'b0000001-0000-0000-0000-000000000003',
   '2026-07-01 11:00:00+00'),

  ('c0000001-0001-0000-0000-000000000003',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000001',
   'b0000001-0000-0000-0000-000000000004',
   '2026-07-01 13:00:00+00'),

  ('c0000001-0001-0000-0000-000000000004',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000002',
   'b0000001-0000-0000-0000-000000000003',
   '2026-07-02 09:00:00+00'),

  ('c0000001-0001-0000-0000-000000000005',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000002',
   'b0000001-0000-0000-0000-000000000004',
   '2026-07-02 11:00:00+00'),

  ('c0000001-0001-0000-0000-000000000006',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000003',
   'b0000001-0000-0000-0000-000000000004',
   '2026-07-02 13:00:00+00');

-- ── Partidos FASE 1 — Grupo B (todos vs todos: 6 partidos) ───────────────────

INSERT INTO matches (id, phase_id, home_team_id, away_team_id, scheduled_at) VALUES
  ('c0000001-0002-0000-0000-000000000001',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000005',
   'b0000001-0000-0000-0000-000000000006',
   '2026-07-01 10:00:00+00'),

  ('c0000001-0002-0000-0000-000000000002',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000005',
   'b0000001-0000-0000-0000-000000000007',
   '2026-07-01 12:00:00+00'),

  ('c0000001-0002-0000-0000-000000000003',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000005',
   'b0000001-0000-0000-0000-000000000008',
   '2026-07-01 14:00:00+00'),

  ('c0000001-0002-0000-0000-000000000004',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000006',
   'b0000001-0000-0000-0000-000000000007',
   '2026-07-02 10:00:00+00'),

  ('c0000001-0002-0000-0000-000000000005',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000006',
   'b0000001-0000-0000-0000-000000000008',
   '2026-07-02 12:00:00+00'),

  ('c0000001-0002-0000-0000-000000000006',
   'a1b2c3d4-0002-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000007',
   'b0000001-0000-0000-0000-000000000008',
   '2026-07-02 14:00:00+00');

-- ============================================================
-- FASES 2-5: Partidos con equipos TBD
-- Los IDs de equipos se actualizan después de la Fase 1.
-- Se usan equipos placeholder (GA1 y GB1) para cumplir con
-- la FK NOT NULL — deben reemplazarse con el script de
-- actualización después de calcular los standings del grupo.
-- ============================================================

-- ── FASE 2 — Copa Oro Semifinales ─────────────────────────────────────────────
-- SF1 Oro: 1A vs 2B   (placeholder: GA1 vs GB2)
-- SF2 Oro: 1B vs 2A   (placeholder: GB1 vs GA2)

INSERT INTO matches (id, phase_id, home_team_id, away_team_id, scheduled_at) VALUES
  ('c0000002-0001-0000-0000-000000000001',
   'a1b2c3d4-0003-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000001',  -- TBD: 1A
   'b0000001-0000-0000-0000-000000000006',  -- TBD: 2B
   '2026-07-04 10:00:00+00'),

  ('c0000002-0001-0000-0000-000000000002',
   'a1b2c3d4-0003-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000005',  -- TBD: 1B
   'b0000001-0000-0000-0000-000000000002',  -- TBD: 2A
   '2026-07-04 13:00:00+00');

-- ── FASE 3 — Copa Oro Final y 3er puesto ─────────────────────────────────────
-- Final Oro:    ganador SF1 vs ganador SF2  (placeholder: GA1 vs GB1)
-- 3er Oro:      perdedor SF1 vs perdedor SF2 (placeholder: GA2 vs GB2)

INSERT INTO matches (id, phase_id, home_team_id, away_team_id, scheduled_at) VALUES
  ('c0000003-0001-0000-0000-000000000001',
   'a1b2c3d4-0004-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000001',  -- TBD: ganador SF1 Oro
   'b0000001-0000-0000-0000-000000000005',  -- TBD: ganador SF2 Oro
   '2026-07-06 16:00:00+00'),

  ('c0000003-0001-0000-0000-000000000002',
   'a1b2c3d4-0004-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000006',  -- TBD: perdedor SF1 Oro
   'b0000001-0000-0000-0000-000000000002',  -- TBD: perdedor SF2 Oro
   '2026-07-06 13:00:00+00');

-- ── FASE 4 — Copa Plata Semifinales ──────────────────────────────────────────
-- SF1 Plata: 3A vs 4B  (placeholder: GA3 vs GB4)
-- SF2 Plata: 3B vs 4A  (placeholder: GB3 vs GA4)

INSERT INTO matches (id, phase_id, home_team_id, away_team_id, scheduled_at) VALUES
  ('c0000004-0001-0000-0000-000000000001',
   'a1b2c3d4-0005-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000003',  -- TBD: 3A
   'b0000001-0000-0000-0000-000000000008',  -- TBD: 4B
   '2026-07-04 10:00:00+00'),

  ('c0000004-0001-0000-0000-000000000002',
   'a1b2c3d4-0005-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000007',  -- TBD: 3B
   'b0000001-0000-0000-0000-000000000004',  -- TBD: 4A
   '2026-07-04 13:00:00+00');

-- ── FASE 5 — Copa Plata Final y 3er puesto ───────────────────────────────────
-- Final Plata:  ganador SF1 Plata vs ganador SF2 Plata
-- 3er Plata:    perdedor SF1 Plata vs perdedor SF2 Plata

INSERT INTO matches (id, phase_id, home_team_id, away_team_id, scheduled_at) VALUES
  ('c0000005-0001-0000-0000-000000000001',
   'a1b2c3d4-0006-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000003',  -- TBD: ganador SF1 Plata
   'b0000001-0000-0000-0000-000000000007',  -- TBD: ganador SF2 Plata
   '2026-07-06 10:00:00+00'),

  ('c0000005-0001-0000-0000-000000000002',
   'a1b2c3d4-0006-0000-0000-000000000000',
   'b0000001-0000-0000-0000-000000000008',  -- TBD: perdedor SF1 Plata
   'b0000001-0000-0000-0000-000000000004',  -- TBD: perdedor SF2 Plata
   '2026-07-06 13:00:00+00');

COMMIT;

-- ============================================================
-- RESUMEN DEL TORNEO CREADO
-- ============================================================
SELECT
  p.name AS fase,
  p.format,
  p.order_index AS orden,
  COUNT(m.id) AS partidos,
  p.status
FROM phases p
LEFT JOIN matches m ON m.phase_id = p.id
WHERE p.tournament_id = 'a1b2c3d4-0001-0000-0000-000000000000'
GROUP BY p.id
ORDER BY p.order_index;
