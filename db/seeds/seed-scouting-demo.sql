-- Seed data for testing the Scouting module.
-- Creates a tournament with 4 teams, players with birth dates, finished matches, and scorers.
-- Run with: psql $DATABASE_URL -f seeds/seed-scouting-demo.sql

-- 1. Get the volleyball sport id
DO $$
DECLARE
  v_sport_id UUID;
  v_tournament_id UUID;
  v_phase_id UUID;
  v_team_a UUID;
  v_team_b UUID;
  v_team_c UUID;
  v_team_d UUID;
  v_match_1 UUID;
  v_match_2 UUID;
  v_match_3 UUID;
  v_player_ids UUID[];
BEGIN
  -- Get volleyball sport
  SELECT id INTO v_sport_id FROM sports WHERE slug = 'volleyball' LIMIT 1;
  IF v_sport_id IS NULL THEN
    SELECT id INTO v_sport_id FROM sports LIMIT 1;
  END IF;

  -- Create tournament
  INSERT INTO tournaments (id, sport_id, name, season, status, category, num_groups, expected_teams, match_duration_minutes, matches_per_day, first_match_time, num_venues)
  VALUES (gen_random_uuid(), v_sport_id, 'Copa Demo Scouting 2026', '2026-B', 'active', 'Sub-15', 2, 8, 60, 4, '08:00', 2)
  RETURNING id INTO v_tournament_id;

  -- Create phase
  INSERT INTO phases (id, tournament_id, name, format, order_index, status)
  VALUES (gen_random_uuid(), v_tournament_id, 'Fase de Grupos', 'groups', 1, 'active')
  RETURNING id INTO v_phase_id;

  -- Create 4 teams
  INSERT INTO teams (id, tournament_id, name, short_name, club_name) VALUES (gen_random_uuid(), v_tournament_id, 'Águilas Doradas', 'AGU', 'Club Águilas') RETURNING id INTO v_team_a;
  INSERT INTO teams (id, tournament_id, name, short_name, club_name) VALUES (gen_random_uuid(), v_tournament_id, 'Tiburones Azules', 'TIB', 'Club Tiburones') RETURNING id INTO v_team_b;
  INSERT INTO teams (id, tournament_id, name, short_name, club_name) VALUES (gen_random_uuid(), v_tournament_id, 'Halcones FC', 'HAL', 'Club Halcones') RETURNING id INTO v_team_c;
  INSERT INTO teams (id, tournament_id, name, short_name, club_name) VALUES (gen_random_uuid(), v_tournament_id, 'Leones del Sur', 'LEO', 'Club Leones') RETURNING id INTO v_team_d;

  -- Create players for Team A (with birth dates for age calculation)
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_a, 'Carlos Rodríguez', 7, 'Armador');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_a, 'Andrés Martínez', 10, 'Opuesto');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_a, 'Luis González', 3, 'Central');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_a, 'David Pérez', 1, 'Líbero');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_a, 'Santiago López', 5, 'Receptor');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_a, 'Mateo Torres', 9, 'Central');

  -- Create players for Team B
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_b, 'Valentina Gómez', 11, 'Opuesto');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_b, 'Isabella Ruiz', 4, 'Armador');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_b, 'Sofía Hernández', 8, 'Central');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_b, 'Camila Díaz', 2, 'Líbero');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_b, 'Mariana Castro', 6, 'Receptor');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_b, 'Laura Moreno', 12, 'Receptor');

  -- Create players for Team C
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_c, 'Juan Pablo Vargas', 14, 'Armador');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_c, 'Nicolás Restrepo', 17, 'Opuesto');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_c, 'Sebastián Muñoz', 21, 'Central');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_c, 'Daniel Ospina', 3, 'Líbero');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_c, 'Alejandro Ríos', 9, 'Receptor');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_c, 'Felipe Cardona', 22, 'Central');

  -- Create players for Team D
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_d, 'Miguel Ángel Suárez', 7, 'Armador');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_d, 'José David Quintero', 10, 'Opuesto');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_d, 'Samuel García', 5, 'Central');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_d, 'Tomás Rivera', 1, 'Líbero');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_d, 'Emiliano Castillo', 8, 'Receptor');
  INSERT INTO players (team_id, name, jersey_number, position) VALUES (v_team_d, 'Martín Salazar', 15, 'Receptor');

  -- Create finished matches
  INSERT INTO matches (id, phase_id, home_team_id, away_team_id, status, winner_id, scheduled_at)
  VALUES (gen_random_uuid(), v_phase_id, v_team_a, v_team_b, 'finished', v_team_a, NOW() - INTERVAL '3 days')
  RETURNING id INTO v_match_1;

  INSERT INTO matches (id, phase_id, home_team_id, away_team_id, status, winner_id, scheduled_at)
  VALUES (gen_random_uuid(), v_phase_id, v_team_c, v_team_d, 'finished', v_team_c, NOW() - INTERVAL '3 days')
  RETURNING id INTO v_match_2;

  INSERT INTO matches (id, phase_id, home_team_id, away_team_id, status, winner_id, scheduled_at)
  VALUES (gen_random_uuid(), v_phase_id, v_team_a, v_team_c, 'finished', v_team_a, NOW() - INTERVAL '1 day')
  RETURNING id INTO v_match_3;

  -- Add scorers (goals/points) for the matches
  -- Match 1: Team A wins — Carlos scores 5, Andrés scores 3
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_1, v_team_a, id, 1, 5 FROM players WHERE team_id = v_team_a AND name = 'Carlos Rodríguez';
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_1, v_team_a, id, 1, 3 FROM players WHERE team_id = v_team_a AND name = 'Andrés Martínez';
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_1, v_team_a, id, 2, 4 FROM players WHERE team_id = v_team_a AND name = 'Carlos Rodríguez';
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_1, v_team_a, id, 2, 2 FROM players WHERE team_id = v_team_a AND name = 'Santiago López';
  -- Team B scorers
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_1, v_team_b, id, 1, 4 FROM players WHERE team_id = v_team_b AND name = 'Valentina Gómez';
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_1, v_team_b, id, 2, 3 FROM players WHERE team_id = v_team_b AND name = 'Valentina Gómez';

  -- Match 2: Team C wins — Juan Pablo scores 6, Nicolás scores 4
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_2, v_team_c, id, 1, 6 FROM players WHERE team_id = v_team_c AND name = 'Juan Pablo Vargas';
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_2, v_team_c, id, 1, 4 FROM players WHERE team_id = v_team_c AND name = 'Nicolás Restrepo';
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_2, v_team_c, id, 2, 3 FROM players WHERE team_id = v_team_c AND name = 'Juan Pablo Vargas';
  -- Team D scorers
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_2, v_team_d, id, 1, 5 FROM players WHERE team_id = v_team_d AND name = 'José David Quintero';
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_2, v_team_d, id, 2, 2 FROM players WHERE team_id = v_team_d AND name = 'Miguel Ángel Suárez';

  -- Match 3: Team A wins again — Carlos 7 more, Luis 2
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_3, v_team_a, id, 1, 7 FROM players WHERE team_id = v_team_a AND name = 'Carlos Rodríguez';
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_3, v_team_a, id, 2, 2 FROM players WHERE team_id = v_team_a AND name = 'Luis González';
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_3, v_team_c, id, 1, 4 FROM players WHERE team_id = v_team_c AND name = 'Nicolás Restrepo';
  INSERT INTO match_scorers (match_id, team_id, player_id, period_number, points)
  SELECT v_match_3, v_team_c, id, 2, 3 FROM players WHERE team_id = v_team_c AND name = 'Juan Pablo Vargas';

  RAISE NOTICE 'Scouting demo data created: tournament=%, teams=4, players=24, matches=3', v_tournament_id;
END $$;
