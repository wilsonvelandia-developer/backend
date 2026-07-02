-- ═══════════════════════════════════════════════════════════════════════════
-- Demo Data Seed — OlimpicApp
-- Creates referees, match results, sanctions, scorers, chat rooms/messages
-- Run: psql -f seeds/seed-demo-data.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Referee Users ────────────────────────────────────────────────────────────
-- (passwords are hashed 'password123' — bcrypt)

INSERT INTO users (id, email, name, first_name, first_last_name, password_hash, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'referee1@olimpicapp.co', 'Carlos Rodríguez', 'Carlos', 'Rodríguez', '$2b$10$dummyhashforseeding000000000000000000000000001', true),
  ('a0000000-0000-0000-0000-000000000002', 'referee2@olimpicapp.co', 'María López', 'María', 'López', '$2b$10$dummyhashforseeding000000000000000000000000002', true),
  ('a0000000-0000-0000-0000-000000000003', 'referee3@olimpicapp.co', 'Juan Pérez', 'Juan', 'Pérez', '$2b$10$dummyhashforseeding000000000000000000000000003', true)
ON CONFLICT (email) DO NOTHING;

-- Assign referee role
INSERT INTO user_roles (user_id, role_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'referee'),
  ('a0000000-0000-0000-0000-000000000002', 'referee'),
  ('a0000000-0000-0000-0000-000000000003', 'referee')
ON CONFLICT DO NOTHING;

-- ── Assign referees to existing matches ─────────────────────────────────────
-- (Assigns to first 6 matches found)

INSERT INTO match_referees (match_id, user_id, referee_role)
SELECT m.id, 'a0000000-0000-0000-0000-000000000001', 'principal'
FROM matches m ORDER BY m.created_at LIMIT 3
ON CONFLICT DO NOTHING;

INSERT INTO match_referees (match_id, user_id, referee_role)
SELECT m.id, 'a0000000-0000-0000-0000-000000000002', 'asistente'
FROM matches m ORDER BY m.created_at LIMIT 4
ON CONFLICT DO NOTHING;

INSERT INTO match_referees (match_id, user_id, referee_role)
SELECT m.id, 'a0000000-0000-0000-0000-000000000003', 'principal'
FROM matches m ORDER BY m.created_at DESC LIMIT 3
ON CONFLICT DO NOTHING;

-- ── Finish some matches with scores ─────────────────────────────────────────
-- Update first 4 scheduled matches to finished with periods scored

UPDATE matches SET status = 'finished', winner_id = home_team_id, updated_at = NOW()
WHERE id IN (SELECT id FROM matches WHERE status = 'scheduled' ORDER BY created_at LIMIT 2);

UPDATE matches SET status = 'finished', winner_id = away_team_id, updated_at = NOW()
WHERE id IN (SELECT id FROM matches WHERE status = 'scheduled' ORDER BY created_at LIMIT 2 OFFSET 2);

-- Create periods for finished matches
INSERT INTO match_periods (match_id, period_number, home_score, away_score, status)
SELECT m.id, 1, 3, 1, 'finished'
FROM matches m WHERE m.status = 'finished'
ON CONFLICT (match_id, period_number) DO UPDATE SET home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score, status = 'finished';

INSERT INTO match_periods (match_id, period_number, home_score, away_score, status)
SELECT m.id, 2, 2, 2, 'finished'
FROM matches m WHERE m.status = 'finished'
ON CONFLICT (match_id, period_number) DO UPDATE SET home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score, status = 'finished';

-- ── Scorers (goals) for finished matches ────────────────────────────────────

INSERT INTO match_scorers (match_id, player_id, event_type, period_number, match_minute)
SELECT m.id, p.id, 'goal', 1, 15
FROM matches m
JOIN players p ON p.team_id = m.home_team_id
WHERE m.status = 'finished'
LIMIT 5
ON CONFLICT DO NOTHING;

INSERT INTO match_scorers (match_id, player_id, event_type, period_number, match_minute)
SELECT m.id, p.id, 'goal', 2, 55
FROM matches m
JOIN players p ON p.team_id = m.away_team_id
WHERE m.status = 'finished'
LIMIT 3
ON CONFLICT DO NOTHING;

INSERT INTO match_scorers (match_id, player_id, event_type, period_number, match_minute)
SELECT m.id, p.id, 'assist', 1, 15
FROM matches m
JOIN players p ON p.team_id = m.home_team_id
WHERE m.status = 'finished'
LIMIT 3
ON CONFLICT DO NOTHING;

-- ── Sanctions (cards) ───────────────────────────────────────────────────────
-- First ensure sanction types exist for the tournament

INSERT INTO sanction_types (id, tournament_id, name, code, points_effect, monetary_value, color, icon, accumulation_limit)
SELECT gen_random_uuid(), t.id, 'Tarjeta Amarilla', 'YELLOW', -10, 0, '#fbbf24', '🟨', 3
FROM tournaments t LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO sanction_types (id, tournament_id, name, code, points_effect, monetary_value, color, icon, accumulation_limit)
SELECT gen_random_uuid(), t.id, 'Tarjeta Roja', 'RED', -30, 50000, '#ef4444', '🟥', NULL
FROM tournaments t LIMIT 1
ON CONFLICT DO NOTHING;

-- Apply some yellow cards
INSERT INTO match_sanctions (match_id, sanction_type_id, team_id, player_id, period_number, minute, notes)
SELECT m.id, st.id, m.home_team_id, p.id, 1, 25, 'Falta táctica'
FROM matches m
CROSS JOIN (SELECT id FROM sanction_types WHERE code = 'YELLOW' LIMIT 1) st
JOIN players p ON p.team_id = m.home_team_id
WHERE m.status = 'finished'
LIMIT 4;

-- Apply a red card
INSERT INTO match_sanctions (match_id, sanction_type_id, team_id, player_id, period_number, minute, notes)
SELECT m.id, st.id, m.away_team_id, p.id, 2, 70, 'Agresión'
FROM matches m
CROSS JOIN (SELECT id FROM sanction_types WHERE code = 'RED' LIMIT 1) st
JOIN players p ON p.team_id = m.away_team_id
WHERE m.status = 'finished'
LIMIT 1;

-- ── Chat rooms and messages ─────────────────────────────────────────────────

-- Get admin user for chat
DO $$
DECLARE
  admin_id UUID;
  tournament_id UUID;
  room_id UUID;
BEGIN
  SELECT u.id INTO admin_id FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role_id = 'admin' LIMIT 1;
  SELECT id INTO tournament_id FROM tournaments LIMIT 1;

  IF admin_id IS NULL OR tournament_id IS NULL THEN RETURN; END IF;

  -- Create tournament chat room
  INSERT INTO chat_rooms (id, type, name, reference_id, created_by)
  VALUES (gen_random_uuid(), 'tournament', 'Chat General — Torneo', tournament_id, admin_id)
  RETURNING id INTO room_id;

  -- Add admin as member
  INSERT INTO chat_room_members (room_id, user_id) VALUES (room_id, admin_id);

  -- Add referees as members
  INSERT INTO chat_room_members (room_id, user_id) VALUES
    (room_id, 'a0000000-0000-0000-0000-000000000001'),
    (room_id, 'a0000000-0000-0000-0000-000000000002')
  ON CONFLICT DO NOTHING;

  -- Insert messages
  INSERT INTO chat_messages (room_id, sender_id, content, created_at) VALUES
    (room_id, admin_id, 'Bienvenidos al chat del torneo. Aquí coordinaremos horarios y sedes.', NOW() - INTERVAL '2 hours'),
    (room_id, 'a0000000-0000-0000-0000-000000000001', 'Perfecto, quedo pendiente de las asignaciones.', NOW() - INTERVAL '1 hour 50 minutes'),
    (room_id, admin_id, 'Los partidos de la jornada 2 se reprogramaron para el sábado.', NOW() - INTERVAL '1 hour'),
    (room_id, 'a0000000-0000-0000-0000-000000000002', 'Entendido. ¿A qué hora es el primer partido?', NOW() - INTERVAL '45 minutes'),
    (room_id, admin_id, '8:00 AM en la Cancha 1. Llegar 15 minutos antes por favor.', NOW() - INTERVAL '30 minutes'),
    (room_id, 'a0000000-0000-0000-0000-000000000001', '¿Necesitan un árbitro adicional para la cancha 2?', NOW() - INTERVAL '15 minutes'),
    (room_id, admin_id, 'Sí, te asigno la cancha 2 para el segundo partido.', NOW() - INTERVAL '5 minutes');
END $$;

-- ── Notifications ───────────────────────────────────────────────────────────

INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id, is_read, created_at)
SELECT u.id, 'schedule_change', 'Cambio de horario', 'El partido de la jornada 2 fue reprogramado al sábado 8:00 AM.',
       'tournament', t.id, false, NOW() - INTERVAL '1 hour'
FROM users u
CROSS JOIN (SELECT id FROM tournaments LIMIT 1) t
JOIN user_roles ur ON ur.user_id = u.id
WHERE ur.role_id IN ('referee', 'admin', 'organizer')
LIMIT 5;

INSERT INTO notifications (user_id, type, title, body, reference_type, is_read, created_at)
SELECT u.id, 'match_result', 'Resultado registrado', 'Se registró el resultado del partido. Consulta las posiciones actualizadas.',
       'match', false, NOW() - INTERVAL '30 minutes'
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE ur.role_id IN ('admin', 'organizer')
LIMIT 3;
