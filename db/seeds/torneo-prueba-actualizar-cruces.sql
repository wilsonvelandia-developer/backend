-- ============================================================
-- SCRIPT: Actualizar equipos TBD en fases 2-5
-- ============================================================
-- Ejecutar DESPUÉS de que terminen todos los partidos de la
-- Fase 1 (grupos) y se hayan recalculado los standings.
--
-- Este script lee los standings del grupo y asigna los equipos
-- correctos a cada partido de las fases eliminatorias.
--
-- Uso:
--   psql -U tournament_user -d tournament_platform \
--        -f torneo-prueba-actualizar-cruces.sql
-- ============================================================

BEGIN;

-- ── Obtener clasificados por grupo ────────────────────────────────────────────
-- Los grupos se identifican por qué equipos participan:
--   Grupo A: equipos GA1-GA4 (b0000001-...-0001 a -0004)
--   Grupo B: equipos GB1-GB4 (b0000001-...-0005 a -0008)

-- Crear tabla temporal con el ranking de cada equipo en su grupo
CREATE TEMP TABLE grupo_rankings AS
WITH grupo_a_teams AS (
  SELECT id FROM teams
  WHERE tournament_id = 'a1b2c3d4-0001-0000-0000-000000000000'
    AND id IN (
      'b0000001-0000-0000-0000-000000000001',
      'b0000001-0000-0000-0000-000000000002',
      'b0000001-0000-0000-0000-000000000003',
      'b0000001-0000-0000-0000-000000000004'
    )
),
grupo_b_teams AS (
  SELECT id FROM teams
  WHERE tournament_id = 'a1b2c3d4-0001-0000-0000-000000000000'
    AND id IN (
      'b0000001-0000-0000-0000-000000000005',
      'b0000001-0000-0000-0000-000000000006',
      'b0000001-0000-0000-0000-000000000007',
      'b0000001-0000-0000-0000-000000000008'
    )
),
standings_ranked AS (
  SELECT
    s.team_id,
    s.points,
    s.sets_won - s.sets_lost    AS set_diff,
    s.score_for - s.score_against AS score_diff,
    CASE WHEN s.team_id IN (SELECT id FROM grupo_a_teams) THEN 'A' ELSE 'B' END AS grupo,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE WHEN s.team_id IN (SELECT id FROM grupo_a_teams) THEN 'A' ELSE 'B' END
      ORDER BY
        s.points DESC,
        (s.sets_won - s.sets_lost) DESC,
        (s.score_for - s.score_against) DESC
    ) AS posicion
  FROM standings s
  WHERE s.phase_id = 'a1b2c3d4-0002-0000-0000-000000000000'
)
SELECT grupo, posicion, team_id FROM standings_ranked;

-- Verificar los clasificados
SELECT grupo, posicion, team_id,
       (SELECT name FROM teams WHERE id = team_id) AS nombre
FROM grupo_rankings
ORDER BY grupo, posicion;

-- ── Helpers: extraer IDs por posición ────────────────────────────────────────

-- Función auxiliar para obtener el equipo de una posición/grupo
-- 1A, 2A, 3A, 4A, 1B, 2B, 3B, 4B

-- ── FASE 2 — Copa Oro Semifinales ─────────────────────────────────────────────
-- SF1 Oro: 1A (home) vs 2B (away)
UPDATE matches
SET
  home_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'A' AND posicion = 1),
  away_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'B' AND posicion = 2)
WHERE id = 'c0000002-0001-0000-0000-000000000001';

-- SF2 Oro: 1B (home) vs 2A (away)
UPDATE matches
SET
  home_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'B' AND posicion = 1),
  away_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'A' AND posicion = 2)
WHERE id = 'c0000002-0001-0000-0000-000000000002';

-- ── FASE 3 — Copa Oro Final (equipos TBD post-semifinal) ──────────────────────
-- Estos se actualizan DESPUÉS de jugar las semifinales.
-- Por ahora actualizamos con los mismos placeholders de SF (se sobreescribirán).
-- Los comentarios indican qué partido provee el resultado.
UPDATE matches
SET
  home_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'A' AND posicion = 1),  -- ganador SF1
  away_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'B' AND posicion = 1)   -- ganador SF2
WHERE id = 'c0000003-0001-0000-0000-000000000001';  -- Final Oro

UPDATE matches
SET
  home_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'B' AND posicion = 2),  -- perdedor SF1
  away_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'A' AND posicion = 2)   -- perdedor SF2
WHERE id = 'c0000003-0001-0000-0000-000000000002';  -- 3er puesto Oro

-- ── FASE 4 — Copa Plata Semifinales ──────────────────────────────────────────
-- SF1 Plata: 3A (home) vs 4B (away)
UPDATE matches
SET
  home_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'A' AND posicion = 3),
  away_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'B' AND posicion = 4)
WHERE id = 'c0000004-0001-0000-0000-000000000001';

-- SF2 Plata: 3B (home) vs 4A (away)
UPDATE matches
SET
  home_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'B' AND posicion = 3),
  away_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'A' AND posicion = 4)
WHERE id = 'c0000004-0001-0000-0000-000000000002';

-- ── FASE 5 — Copa Plata Final (placeholders, sobreescribir tras SF Plata) ─────
UPDATE matches
SET
  home_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'A' AND posicion = 3),
  away_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'B' AND posicion = 3)
WHERE id = 'c0000005-0001-0000-0000-000000000001';  -- Final Plata

UPDATE matches
SET
  home_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'B' AND posicion = 4),
  away_team_id = (SELECT team_id FROM grupo_rankings WHERE grupo = 'A' AND posicion = 4)
WHERE id = 'c0000005-0001-0000-0000-000000000002';  -- 3er puesto Plata

-- ── Activar fases Copa Oro y Copa Plata ───────────────────────────────────────
UPDATE phases SET status = 'active'
WHERE id IN (
  'a1b2c3d4-0003-0000-0000-000000000000',  -- Copa Oro SF
  'a1b2c3d4-0005-0000-0000-000000000000'   -- Copa Plata SF
);

COMMIT;

-- Verificación final
SELECT
  p.name AS fase,
  m.scheduled_at::date AS fecha,
  th.name AS local,
  ta.name AS visitante
FROM matches m
JOIN phases p ON p.id = m.phase_id
JOIN teams th ON th.id = m.home_team_id
JOIN teams ta ON ta.id = m.away_team_id
WHERE p.tournament_id = 'a1b2c3d4-0001-0000-0000-000000000000'
ORDER BY p.order_index, m.scheduled_at;
