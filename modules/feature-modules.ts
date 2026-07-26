/**
 * All new feature modules — mounted as Express routes.
 * Each module is gated by the feature flags system.
 */
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { buildFeatureGateMiddleware } from '../services/gateway/src/middleware/feature-gate.middleware.js';

export function buildFeatureModulesRouter(pool: Pool, authMiddleware: unknown): Router {
  const router = Router();
  const { featureGate } = buildFeatureGateMiddleware(pool);
  const auth = authMiddleware as (req: Request, res: Response, next: () => void) => void;

  // ── Feature Flags Admin ─────────────────────────────────────────

  // GET /features — list all platform features
  router.get('/features', auth, async (_req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT pf.*, COALESCE(
        (SELECT json_agg(json_build_object('planId', plf.plan_id, 'planName', sp.name, 'enabled', plf.is_enabled))
         FROM plan_features plf JOIN subscription_plans sp ON sp.id = plf.plan_id WHERE plf.feature_code = pf.code), '[]'
      ) AS "plans"
      FROM platform_features pf ORDER BY pf.category, pf.name`,
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  // PUT /features/:code/plans/:planId — toggle feature for a plan
  router.put('/features/:code/plans/:planId', auth, async (req: Request, res: Response) => {
    const { code, planId } = req.params;
    const { isEnabled, config: featureConfig } = req.body as { isEnabled?: boolean; config?: Record<string, unknown> };
    const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];
    if (!roles.includes('admin')) { res.status(403).json({ data: null, success: false, message: 'Solo admin' }); return; }

    await pool.query(
      `INSERT INTO plan_features (plan_id, feature_code, is_enabled, config)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (plan_id, feature_code) DO UPDATE SET is_enabled = $3, config = COALESCE($4, plan_features.config)`,
      [planId, code, isEnabled ?? true, featureConfig ? JSON.stringify(featureConfig) : null],
    );
    res.json({ data: { code, planId, isEnabled }, success: true, message: 'Feature actualizada' });
  });

  // ── Match Sheets ────────────────────────────────────────────────
  router.get('/match-sheets/:matchId', auth, featureGate('match_sheet'), async (req: Request, res: Response) => {
    const result = await pool.query(`SELECT * FROM match_sheets WHERE match_id = $1`, [req.params['matchId']]);
    res.json({ data: result.rows[0] ?? null, success: true, message: '' });
  });

  router.post('/match-sheets', auth, featureGate('match_sheet'), async (req: Request, res: Response) => {
    const { matchId, observations } = req.body as { matchId: string; observations?: string };
    if (!matchId) { res.status(422).json({ data: null, success: false, message: 'matchId requerido' }); return; }
    const result = await pool.query(
      `INSERT INTO match_sheets (match_id, observations) VALUES ($1, $2)
       ON CONFLICT (match_id) DO UPDATE SET observations = COALESCE($2, match_sheets.observations)
       RETURNING *`, [matchId, observations ?? null],
    );
    res.json({ data: result.rows[0], success: true, message: 'Planilla creada' });
  });

  router.put('/match-sheets/:matchId/sign', auth, featureGate('match_sheet'), async (req: Request, res: Response) => {
    const { matchId } = req.params;
    const { role, signatureUrl } = req.body as { role: string; signatureUrl: string };
    const colMap: Record<string, string> = {
      referee: 'referee_signature_url', home_delegate: 'home_delegate_signature_url',
      away_delegate: 'away_delegate_signature_url', home_captain: 'home_captain_signature_url',
      away_captain: 'away_captain_signature_url',
    };
    const col = colMap[role];
    if (!col) { res.status(422).json({ data: null, success: false, message: 'Rol inválido' }); return; }
    await pool.query(`UPDATE match_sheets SET ${col} = $1 WHERE match_id = $2`, [signatureUrl, matchId]);
    // Check if all required signatures are present
    const sheet = await pool.query(`SELECT * FROM match_sheets WHERE match_id = $1`, [matchId]);
    const row = sheet.rows[0] as Record<string, unknown> | undefined;
    if (row && row['referee_signature_url'] && row['home_captain_signature_url'] && row['away_captain_signature_url']) {
      await pool.query(`UPDATE match_sheets SET is_signed = true, signed_at = NOW() WHERE match_id = $1`, [matchId]);
    }
    res.json({ data: null, success: true, message: 'Firma registrada' });
  });

  // ── Transfers ───────────────────────────────────────────────────
  router.get('/transfers', auth, featureGate('transfers'), async (req: Request, res: Response) => {
    const tournamentId = req.query['tournamentId'] as string | undefined;
    const where = tournamentId ? 'WHERE pt.tournament_id = $1' : '';
    const values = tournamentId ? [tournamentId] : [];
    const result = await pool.query(
      `SELECT pt.*, p.name AS "playerName", ft.name AS "fromTeamName", tt.name AS "toTeamName"
       FROM player_transfers pt
       JOIN players p ON p.id = pt.player_id
       LEFT JOIN teams ft ON ft.id = pt.from_team_id
       JOIN teams tt ON tt.id = pt.to_team_id
       ${where} ORDER BY pt.created_at DESC`, values,
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  router.post('/transfers', auth, featureGate('transfers'), async (req: Request, res: Response) => {
    const { playerId, fromTeamId, toTeamId, tournamentId, newJerseyNumber, reason } = req.body as Record<string, unknown>;
    if (!playerId || !toTeamId || !tournamentId) { res.status(422).json({ data: null, success: false, message: 'playerId, toTeamId y tournamentId requeridos' }); return; }
    const result = await pool.query(
      `INSERT INTO player_transfers (player_id, from_team_id, to_team_id, tournament_id, new_jersey_number, reason)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [playerId, fromTeamId ?? null, toTeamId, tournamentId, newJerseyNumber ?? null, reason ?? null],
    );
    res.json({ data: result.rows[0], success: true, message: 'Transferencia registrada' });
  });

  router.put('/transfers/:id/approve', auth, featureGate('transfers'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { id } = req.params;
    // Approve and execute transfer
    const transfer = await pool.query(`SELECT * FROM player_transfers WHERE id = $1`, [id]);
    if (!transfer.rows[0]) { res.status(404).json({ data: null, success: false, message: 'Transferencia no encontrada' }); return; }
    const t = transfer.rows[0] as Record<string, unknown>;
    await pool.query(`UPDATE player_transfers SET status = 'approved', approved_by = $1, approved_at = NOW() WHERE id = $2`, [userId, id]);
    // Move player to new team
    await pool.query(`UPDATE players SET team_id = $1, jersey_number = COALESCE($2, jersey_number) WHERE id = $3`,
      [t['to_team_id'], t['new_jersey_number'], t['player_id']]);
    res.json({ data: null, success: true, message: 'Transferencia aprobada y ejecutada' });
  });

  // ── Injuries ────────────────────────────────────────────────────
  router.get('/injuries', auth, featureGate('injuries'), async (req: Request, res: Response) => {
    const playerId = req.query['playerId'] as string | undefined;
    const status = req.query['status'] as string | undefined;
    const conditions: string[] = []; const values: unknown[] = []; let idx = 1;
    if (playerId) { conditions.push(`pi.player_id = $${idx++}`); values.push(playerId); }
    if (status) { conditions.push(`pi.status = $${idx++}`); values.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT pi.*, p.name AS "playerName", t.name AS "teamName"
       FROM player_injuries pi JOIN players p ON p.id = pi.player_id JOIN teams t ON t.id = p.team_id
       ${where} ORDER BY pi.injury_date DESC`, values,
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  router.post('/injuries', auth, featureGate('injuries'), async (req: Request, res: Response) => {
    const { playerId, matchId, injuryType, bodyPart, severity, description, injuryDate, estimatedRecoveryDays } = req.body as Record<string, unknown>;
    if (!playerId || !injuryType || !injuryDate) { res.status(422).json({ data: null, success: false, message: 'playerId, injuryType y injuryDate requeridos' }); return; }
    const userId = req.headers['x-user-id'] as string;
    const result = await pool.query(
      `INSERT INTO player_injuries (player_id, match_id, injury_type, body_part, severity, description, injury_date, estimated_recovery_days, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [playerId, matchId ?? null, injuryType, bodyPart ?? null, severity ?? 'minor', description ?? null, injuryDate, estimatedRecoveryDays ?? null, userId],
    );
    res.json({ data: result.rows[0], success: true, message: 'Lesión registrada' });
  });

  router.put('/injuries/:id', auth, featureGate('injuries'), async (req: Request, res: Response) => {
    const { status, actualReturnDate } = req.body as { status?: string; actualReturnDate?: string };
    const fields: string[] = []; const values: unknown[] = []; let idx = 1;
    if (status) { fields.push(`status=$${idx++}`); values.push(status); }
    if (actualReturnDate) { fields.push(`actual_return_date=$${idx++}`); values.push(actualReturnDate); }
    if (!fields.length) { res.status(422).json({ data: null, success: false, message: 'Nada que actualizar' }); return; }
    values.push(req.params['id']);
    await pool.query(`UPDATE player_injuries SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    res.json({ data: null, success: true, message: 'Lesión actualizada' });
  });

  // ── Advanced Stats ──────────────────────────────────────────────
  router.post('/stats', auth, featureGate('advanced_stats'), async (req: Request, res: Response) => {
    const { playerId, matchId, statType, value } = req.body as { playerId: string; matchId: string; statType: string; value: number };
    if (!playerId || !matchId || !statType) { res.status(422).json({ data: null, success: false, message: 'playerId, matchId, statType requeridos' }); return; }
    const result = await pool.query(
      `INSERT INTO player_match_stats (player_id, match_id, stat_type, value) VALUES ($1, $2, $3, $4)
       ON CONFLICT (player_id, match_id, stat_type) DO UPDATE SET value = $4 RETURNING *`,
      [playerId, matchId, statType, value ?? 0],
    );
    res.json({ data: result.rows[0], success: true, message: 'Estadística registrada' });
  });

  router.get('/stats/player/:playerId', auth, featureGate('advanced_stats'), async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT stat_type AS "statType", SUM(value)::float AS total, COUNT(*)::int AS "matchCount", ROUND(AVG(value), 2)::float AS average
       FROM player_match_stats WHERE player_id = $1 GROUP BY stat_type ORDER BY total DESC`,
      [req.params['playerId']],
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  // ── Fair Play ───────────────────────────────────────────────────
  router.post('/fair-play', auth, featureGate('fair_play'), async (req: Request, res: Response) => {
    const { teamId, matchId, punctuality, sportsmanship, uniform, discipline, notes } = req.body as Record<string, unknown>;
    if (!teamId || !matchId) { res.status(422).json({ data: null, success: false, message: 'teamId y matchId requeridos' }); return; }
    const total = ((punctuality as number) ?? 0) + ((sportsmanship as number) ?? 0) + ((uniform as number) ?? 0) + ((discipline as number) ?? 0);
    const userId = req.headers['x-user-id'] as string;
    const result = await pool.query(
      `INSERT INTO fair_play_scores (team_id, match_id, punctuality_score, sportsmanship_score, uniform_score, discipline_score, total_score, notes, scored_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (team_id, match_id) DO UPDATE SET punctuality_score=$3, sportsmanship_score=$4, uniform_score=$5, discipline_score=$6, total_score=$7, notes=$8
       RETURNING *`,
      [teamId, matchId, punctuality ?? 0, sportsmanship ?? 0, uniform ?? 0, discipline ?? 0, total, notes ?? null, userId],
    );
    res.json({ data: result.rows[0], success: true, message: 'Fair Play registrado' });
  });

  router.get('/fair-play/standings/:tournamentId', auth, featureGate('fair_play'), async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT t.id AS "teamId", t.name AS "teamName", COALESCE(SUM(fps.total_score), 0)::int AS "totalScore",
              COUNT(fps.id)::int AS "matchesEvaluated"
       FROM teams t LEFT JOIN fair_play_scores fps ON fps.team_id = t.id
       WHERE t.tournament_id = $1 AND t.is_deleted = false
       GROUP BY t.id, t.name ORDER BY "totalScore" DESC`,
      [req.params['tournamentId']],
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  // ── Predictions (Polla) ─────────────────────────────────────────
  router.get('/predictions/pools', auth, featureGate('predictions'), async (req: Request, res: Response) => {
    const tournamentId = req.query['tournamentId'] as string | undefined;
    const where = tournamentId ? 'WHERE pp.tournament_id = $1' : '';
    const result = await pool.query(
      `SELECT pp.*, trn.name AS "tournamentName" FROM prediction_pools pp
       JOIN tournaments trn ON trn.id = pp.tournament_id ${where} ORDER BY pp.created_at DESC`,
      tournamentId ? [tournamentId] : [],
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  router.post('/predictions/pools', auth, featureGate('predictions'), async (req: Request, res: Response) => {
    const { tournamentId, name, pointsExact, pointsWinner } = req.body as Record<string, unknown>;
    if (!tournamentId || !name) { res.status(422).json({ data: null, success: false, message: 'tournamentId y name requeridos' }); return; }
    const result = await pool.query(
      `INSERT INTO prediction_pools (tournament_id, name, points_exact, points_winner) VALUES ($1, $2, $3, $4) RETURNING *`,
      [tournamentId, name, pointsExact ?? 3, pointsWinner ?? 1],
    );
    res.json({ data: result.rows[0], success: true, message: 'Polla creada' });
  });

  router.post('/predictions', auth, featureGate('predictions'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { poolId, matchId, predictedHomeScore, predictedAwayScore } = req.body as Record<string, unknown>;
    if (!poolId || !matchId || predictedHomeScore === undefined || predictedAwayScore === undefined) {
      res.status(422).json({ data: null, success: false, message: 'poolId, matchId, predictedHomeScore, predictedAwayScore requeridos' }); return;
    }
    const result = await pool.query(
      `INSERT INTO predictions (pool_id, user_id, match_id, predicted_home_score, predicted_away_score)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (pool_id, user_id, match_id) DO UPDATE SET predicted_home_score = $4, predicted_away_score = $5
       RETURNING *`,
      [poolId, userId, matchId, predictedHomeScore, predictedAwayScore],
    );
    res.json({ data: result.rows[0], success: true, message: 'Predicción guardada' });
  });

  router.get('/predictions/leaderboard/:poolId', auth, featureGate('predictions'), async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT u.id AS "userId", u.name, SUM(p.points_earned)::int AS "totalPoints",
              COUNT(CASE WHEN p.is_evaluated THEN 1 END)::int AS "evaluated"
       FROM predictions p JOIN users u ON u.id = p.user_id
       WHERE p.pool_id = $1 GROUP BY u.id, u.name ORDER BY "totalPoints" DESC`,
      [req.params['poolId']],
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  // ── Live Voting ─────────────────────────────────────────────────
  router.post('/polls', auth, featureGate('live_voting'), async (req: Request, res: Response) => {
    const { matchId, question, pollType, options, closesAt } = req.body as { matchId: string; question: string; pollType?: string; options: Array<{ label: string; playerId?: string }>; closesAt?: string };
    if (!matchId || !question || !options?.length) { res.status(422).json({ data: null, success: false, message: 'matchId, question y options requeridos' }); return; }
    const pollResult = await pool.query(
      `INSERT INTO live_polls (match_id, question, poll_type, closes_at) VALUES ($1, $2, $3, $4) RETURNING *`,
      [matchId, question, pollType ?? 'mvp', closesAt ?? null],
    );
    const pollId = (pollResult.rows[0] as { id: string }).id;
    for (const opt of options) {
      await pool.query(`INSERT INTO live_poll_options (poll_id, label, player_id) VALUES ($1, $2, $3)`, [pollId, opt.label, opt.playerId ?? null]);
    }
    res.json({ data: pollResult.rows[0], success: true, message: 'Encuesta creada' });
  });

  router.post('/polls/:pollId/vote', auth, featureGate('live_voting'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { optionId } = req.body as { optionId: string };
    if (!optionId) { res.status(422).json({ data: null, success: false, message: 'optionId requerido' }); return; }
    try {
      await pool.query(`INSERT INTO live_poll_votes (poll_id, option_id, user_id) VALUES ($1, $2, $3)`, [req.params['pollId'], optionId, userId]);
      await pool.query(`UPDATE live_poll_options SET votes_count = votes_count + 1 WHERE id = $1`, [optionId]);
      res.json({ data: null, success: true, message: 'Voto registrado' });
    } catch {
      res.status(409).json({ data: null, success: false, message: 'Ya votaste en esta encuesta' });
    }
  });

  router.get('/polls/:pollId/results', auth, featureGate('live_voting'), async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT lpo.*, p.name AS "playerName" FROM live_poll_options lpo
       LEFT JOIN players p ON p.id = lpo.player_id WHERE lpo.poll_id = $1 ORDER BY lpo.votes_count DESC`,
      [req.params['pollId']],
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  // ── Social Wall ─────────────────────────────────────────────────
  router.get('/social/:tournamentId', auth, featureGate('social_wall'), async (req: Request, res: Response) => {
    const page = parseInt(req.query['page'] as string ?? '1', 10);
    const pageSize = parseInt(req.query['pageSize'] as string ?? '20', 10);
    const result = await pool.query(
      `SELECT sp.*, u.name AS "authorName", u.photo_url AS "authorPhotoUrl", t.name AS "teamName",
              COUNT(*) OVER()::int AS _total
       FROM social_posts sp JOIN users u ON u.id = sp.user_id LEFT JOIN teams t ON t.id = sp.team_id
       WHERE sp.tournament_id = $1 AND sp.is_deleted = false
       ORDER BY sp.is_pinned DESC, sp.created_at DESC LIMIT $2 OFFSET $3`,
      [req.params['tournamentId'], pageSize, (page - 1) * pageSize],
    );
    const total = result.rows[0] ? (result.rows[0] as Record<string, unknown>)['_total'] as number : 0;
    const data = result.rows.map((r: Record<string, unknown>) => { const row = { ...r }; delete row['_total']; return row; });
    res.json({ data, total, page, pageSize, success: true, message: '' });
  });

  router.post('/social', auth, featureGate('social_wall'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { tournamentId, teamId, content, imageUrl } = req.body as Record<string, unknown>;
    if (!tournamentId || !content) { res.status(422).json({ data: null, success: false, message: 'tournamentId y content requeridos' }); return; }
    const result = await pool.query(
      `INSERT INTO social_posts (tournament_id, user_id, team_id, content, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tournamentId, userId, teamId ?? null, content, imageUrl ?? null],
    );
    res.json({ data: result.rows[0], success: true, message: 'Post publicado' });
  });

  router.post('/social/:postId/like', auth, featureGate('social_wall'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    try {
      await pool.query(`INSERT INTO social_post_likes (post_id, user_id) VALUES ($1, $2)`, [req.params['postId'], userId]);
      await pool.query(`UPDATE social_posts SET likes_count = likes_count + 1 WHERE id = $1`, [req.params['postId']]);
      res.json({ data: null, success: true, message: 'Like' });
    } catch { res.json({ data: null, success: true, message: 'Ya diste like' }); }
  });

  router.post('/social/:postId/comments', auth, featureGate('social_wall'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { content } = req.body as { content: string };
    if (!content) { res.status(422).json({ data: null, success: false, message: 'content requerido' }); return; }
    const result = await pool.query(
      `INSERT INTO social_post_comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING *`,
      [req.params['postId'], userId, content],
    );
    await pool.query(`UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = $1`, [req.params['postId']]);
    res.json({ data: result.rows[0], success: true, message: 'Comentario publicado' });
  });

  // ── Referee Ratings ─────────────────────────────────────────────
  router.post('/referee-ratings', auth, featureGate('referee_ratings'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { matchId, refereeUserId, teamId, impartiality, knowledge, communication, overall, comment } = req.body as Record<string, unknown>;
    if (!matchId || !refereeUserId) { res.status(422).json({ data: null, success: false, message: 'matchId y refereeUserId requeridos' }); return; }
    try {
      const result = await pool.query(
        `INSERT INTO referee_ratings (match_id, referee_user_id, rated_by_user_id, rated_by_team_id, impartiality_score, knowledge_score, communication_score, overall_score, comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [matchId, refereeUserId, userId, teamId ?? null, impartiality ?? 3, knowledge ?? 3, communication ?? 3, overall ?? 3, comment ?? null],
      );
      res.json({ data: result.rows[0], success: true, message: 'Calificación registrada' });
    } catch { res.status(409).json({ data: null, success: false, message: 'Ya calificaste a este árbitro en este partido' }); }
  });

  router.get('/referee-ratings/:refereeUserId', auth, featureGate('referee_ratings'), async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT ROUND(AVG(impartiality_score), 1)::float AS "avgImpartiality",
              ROUND(AVG(knowledge_score), 1)::float AS "avgKnowledge",
              ROUND(AVG(communication_score), 1)::float AS "avgCommunication",
              ROUND(AVG(overall_score), 1)::float AS "avgOverall",
              COUNT(*)::int AS "totalRatings"
       FROM referee_ratings WHERE referee_user_id = $1`,
      [req.params['refereeUserId']],
    );
    res.json({ data: result.rows[0], success: true, message: '' });
  });

  // ── Incidents ───────────────────────────────────────────────────
  router.get('/incidents', auth, featureGate('incidents'), async (req: Request, res: Response) => {
    const tournamentId = req.query['tournamentId'] as string | undefined;
    const status = req.query['status'] as string | undefined;
    const conditions: string[] = []; const values: unknown[] = []; let idx = 1;
    if (tournamentId) { conditions.push(`mi.tournament_id = $${idx++}`); values.push(tournamentId); }
    if (status) { conditions.push(`mi.status = $${idx++}`); values.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT mi.*, u.name AS "reporterName" FROM match_incidents mi LEFT JOIN users u ON u.id = mi.reported_by ${where} ORDER BY mi.created_at DESC`, values,
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  router.post('/incidents', auth, featureGate('incidents'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { matchId, tournamentId, incidentType, severity, description, involvedPlayers, involvedTeams } = req.body as Record<string, unknown>;
    if (!matchId || !tournamentId || !incidentType || !description) { res.status(422).json({ data: null, success: false, message: 'Campos requeridos faltantes' }); return; }
    const result = await pool.query(
      `INSERT INTO match_incidents (match_id, tournament_id, incident_type, severity, description, involved_players, involved_teams, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [matchId, tournamentId, incidentType, severity ?? 'medium', description, JSON.stringify(involvedPlayers ?? []), JSON.stringify(involvedTeams ?? []), userId],
    );
    res.json({ data: result.rows[0], success: true, message: 'Incidente reportado' });
  });

  router.put('/incidents/:id/resolve', auth, featureGate('incidents'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { actionTaken } = req.body as { actionTaken: string };
    await pool.query(
      `UPDATE match_incidents SET status = 'resolved', action_taken = $1, resolved_by = $2, resolved_at = NOW() WHERE id = $3`,
      [actionTaken ?? '', userId, req.params['id']],
    );
    res.json({ data: null, success: true, message: 'Incidente resuelto' });
  });

  // ── QR Check-in ─────────────────────────────────────────────────
  router.post('/checkin', auth, featureGate('qr_checkin'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { matchId, playerId, teamId, method } = req.body as Record<string, unknown>;
    if (!matchId || !playerId || !teamId) { res.status(422).json({ data: null, success: false, message: 'matchId, playerId y teamId requeridos' }); return; }
    try {
      const result = await pool.query(
        `INSERT INTO match_checkins (match_id, player_id, team_id, checked_in_by, method) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [matchId, playerId, teamId, userId, method ?? 'qr'],
      );
      res.json({ data: result.rows[0], success: true, message: 'Check-in exitoso' });
    } catch { res.status(409).json({ data: null, success: false, message: 'Jugador ya tiene check-in' }); }
  });

  router.get('/checkin/:matchId', auth, featureGate('qr_checkin'), async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT mc.*, p.name AS "playerName", p.jersey_number AS "jerseyNumber", t.name AS "teamName"
       FROM match_checkins mc JOIN players p ON p.id = mc.player_id JOIN teams t ON t.id = mc.team_id
       WHERE mc.match_id = $1 ORDER BY mc.checked_in_at`, [req.params['matchId']],
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  // ── Attendance (training) ───────────────────────────────────────
  router.get('/attendance/sessions', auth, featureGate('attendance'), async (req: Request, res: Response) => {
    const teamId = req.query['teamId'] as string | undefined;
    if (!teamId) { res.status(422).json({ data: null, success: false, message: 'teamId requerido' }); return; }
    const result = await pool.query(
      `SELECT ts.*, (SELECT COUNT(*)::int FROM training_attendance ta WHERE ta.session_id = ts.id AND ta.status = 'present') AS "presentCount",
              (SELECT COUNT(*)::int FROM training_attendance ta WHERE ta.session_id = ts.id) AS "totalCount"
       FROM training_sessions ts WHERE ts.team_id = $1 ORDER BY ts.session_date DESC`, [teamId],
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  router.post('/attendance/sessions', auth, featureGate('attendance'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { teamId, sessionDate, startTime, endTime, venue, notes } = req.body as Record<string, unknown>;
    if (!teamId || !sessionDate) { res.status(422).json({ data: null, success: false, message: 'teamId y sessionDate requeridos' }); return; }
    const result = await pool.query(
      `INSERT INTO training_sessions (team_id, session_date, start_time, end_time, venue, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [teamId, sessionDate, startTime ?? null, endTime ?? null, venue ?? null, notes ?? null, userId],
    );
    res.json({ data: result.rows[0], success: true, message: 'Sesión creada' });
  });

  router.post('/attendance/sessions/:sessionId/record', auth, featureGate('attendance'), async (req: Request, res: Response) => {
    const { records } = req.body as { records: Array<{ playerId: string; status: string; arrivedAt?: string; notes?: string }> };
    if (!records?.length) { res.status(422).json({ data: null, success: false, message: 'records requerido' }); return; }
    for (const r of records) {
      await pool.query(
        `INSERT INTO training_attendance (session_id, player_id, status, arrived_at, notes) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (session_id, player_id) DO UPDATE SET status = $3, arrived_at = $4, notes = $5`,
        [req.params['sessionId'], r.playerId, r.status, r.arrivedAt ?? null, r.notes ?? null],
      );
    }
    res.json({ data: null, success: true, message: `${records.length} registros guardados` });
  });

  // ── Uniforms ────────────────────────────────────────────────────
  router.get('/uniforms/:teamId', auth, featureGate('uniforms'), async (req: Request, res: Response) => {
    const result = await pool.query(`SELECT * FROM team_uniforms WHERE team_id = $1 ORDER BY uniform_type`, [req.params['teamId']]);
    res.json({ data: result.rows, success: true, message: '' });
  });

  router.post('/uniforms', auth, featureGate('uniforms'), async (req: Request, res: Response) => {
    const { teamId, uniformType, primaryColor, secondaryColor, shortsColor, socksColor, imageUrl } = req.body as Record<string, unknown>;
    if (!teamId || !uniformType) { res.status(422).json({ data: null, success: false, message: 'teamId y uniformType requeridos' }); return; }
    const result = await pool.query(
      `INSERT INTO team_uniforms (team_id, uniform_type, primary_color, secondary_color, shorts_color, socks_color, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (team_id, uniform_type) DO UPDATE SET primary_color=$3, secondary_color=$4, shorts_color=$5, socks_color=$6, image_url=$7
       RETURNING *`,
      [teamId, uniformType, primaryColor ?? null, secondaryColor ?? null, shortsColor ?? null, socksColor ?? null, imageUrl ?? null],
    );
    res.json({ data: result.rows[0], success: true, message: 'Uniforme registrado' });
  });

  // Check uniform conflict for a match
  router.get('/uniforms/conflict/:matchId', auth, featureGate('uniforms'), async (req: Request, res: Response) => {
    const match = await pool.query(`SELECT home_team_id, away_team_id FROM matches WHERE id = $1`, [req.params['matchId']]);
    if (!match.rows[0]) { res.status(404).json({ data: null, success: false, message: 'Partido no encontrado' }); return; }
    const { home_team_id, away_team_id } = match.rows[0] as { home_team_id: string; away_team_id: string };
    const homeUni = await pool.query(`SELECT * FROM team_uniforms WHERE team_id = $1 AND uniform_type = 'home'`, [home_team_id]);
    const awayUni = await pool.query(`SELECT * FROM team_uniforms WHERE team_id = $1 AND uniform_type = 'home'`, [away_team_id]);
    const homeColor = (homeUni.rows[0] as Record<string, unknown>)?.['primary_color'];
    const awayColor = (awayUni.rows[0] as Record<string, unknown>)?.['primary_color'];
    const hasConflict = homeColor && awayColor && homeColor === awayColor;
    res.json({ data: { hasConflict, homeColor, awayColor, suggestion: hasConflict ? 'El equipo visitante debe usar uniforme alterno' : null }, success: true, message: '' });
  });

  // ── Calendar Sync (iCal export) ─────────────────────────────────
  router.get('/calendar/:tournamentId.ics', featureGate('calendar_sync'), async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT m.id, m.scheduled_at, m.venue, ht.name AS home, at.name AS away, trn.name AS tournament
       FROM matches m JOIN teams ht ON ht.id = m.home_team_id JOIN teams at ON at.id = m.away_team_id
       JOIN phases ph ON ph.id = m.phase_id JOIN tournaments trn ON trn.id = ph.tournament_id
       WHERE ph.tournament_id = $1 AND m.scheduled_at IS NOT NULL ORDER BY m.scheduled_at`,
      [req.params['tournamentId']],
    );
    let ical = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//OlimpicApp//ES\r\nCALSCALE:GREGORIAN\r\n';
    for (const m of result.rows) {
      const row = m as Record<string, string>;
      const start = new Date(row['scheduled_at']).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const end = new Date(new Date(row['scheduled_at']).getTime() + 90 * 60000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      ical += `BEGIN:VEVENT\r\nUID:${row['id']}@olimpicapp\r\nDTSTART:${start}\r\nDTEND:${end}\r\n`;
      ical += `SUMMARY:${row['home']} vs ${row['away']}\r\nLOCATION:${row['venue'] ?? ''}\r\nDESCRIPTION:${row['tournament']}\r\nEND:VEVENT\r\n`;
    }
    ical += 'END:VCALENDAR\r\n';
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params['tournamentId']}.ics"`);
    res.send(ical);
  });

  // ── Webhooks ────────────────────────────────────────────────────
  router.get('/webhooks', auth, featureGate('webhooks'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const result = await pool.query(`SELECT * FROM webhook_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    res.json({ data: result.rows, success: true, message: '' });
  });

  router.post('/webhooks', auth, featureGate('webhooks'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { tournamentId, url, events, secret } = req.body as Record<string, unknown>;
    if (!url || !events) { res.status(422).json({ data: null, success: false, message: 'url y events requeridos' }); return; }
    const result = await pool.query(
      `INSERT INTO webhook_subscriptions (user_id, tournament_id, url, events, secret) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId, tournamentId ?? null, url, JSON.stringify(events), secret ?? null],
    );
    res.json({ data: result.rows[0], success: true, message: 'Webhook creado' });
  });

  router.delete('/webhooks/:id', auth, featureGate('webhooks'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    await pool.query(`DELETE FROM webhook_subscriptions WHERE id = $1 AND user_id = $2`, [req.params['id'], userId]);
    res.json({ data: null, success: true, message: 'Webhook eliminado' });
  });

  // ── Elo Rating ──────────────────────────────────────────────────
  router.get('/elo/:tournamentId', auth, featureGate('elo_rating'), async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT ter.*, t.name AS "teamName" FROM team_elo_ratings ter JOIN teams t ON t.id = ter.team_id
       WHERE ter.tournament_id = $1 ORDER BY ter.rating DESC`, [req.params['tournamentId']],
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  router.post('/elo/:tournamentId/recalculate', auth, featureGate('elo_rating'), async (req: Request, res: Response) => {
    const { tournamentId } = req.params;
    // Reset all ratings to 1500
    await pool.query(`DELETE FROM team_elo_ratings WHERE tournament_id = $1`, [tournamentId]);
    // Get all finished matches in order
    const matches = await pool.query(
      `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score FROM matches m
       JOIN phases ph ON ph.id = m.phase_id WHERE ph.tournament_id = $1 AND m.status = 'finished'
       ORDER BY m.scheduled_at NULLS LAST, m.updated_at`,
      [tournamentId],
    );
    const ratings = new Map<string, number>();
    const K = 32;
    for (const m of matches.rows) {
      const row = m as { home_team_id: string; away_team_id: string; home_score: number; away_score: number };
      const ra = ratings.get(row.home_team_id) ?? 1500;
      const rb = ratings.get(row.away_team_id) ?? 1500;
      const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
      const eb = 1 - ea;
      let sa: number, sb: number;
      if (row.home_score > row.away_score) { sa = 1; sb = 0; }
      else if (row.home_score < row.away_score) { sa = 0; sb = 1; }
      else { sa = 0.5; sb = 0.5; }
      ratings.set(row.home_team_id, Math.round((ra + K * (sa - ea)) * 100) / 100);
      ratings.set(row.away_team_id, Math.round((rb + K * (sb - eb)) * 100) / 100);
    }
    // Save
    for (const [teamId, rating] of ratings) {
      await pool.query(
        `INSERT INTO team_elo_ratings (team_id, tournament_id, rating, matches_played) VALUES ($1,$2,$3,$4)
         ON CONFLICT (team_id, tournament_id) DO UPDATE SET rating = $3, matches_played = $4, updated_at = NOW()`,
        [teamId, tournamentId, rating, matches.rows.filter((mm: unknown) => {
          const r = mm as { home_team_id: string; away_team_id: string };
          return r.home_team_id === teamId || r.away_team_id === teamId;
        }).length],
      );
    }
    res.json({ data: { teamsUpdated: ratings.size }, success: true, message: 'Elo recalculado' });
  });

  // ── Player Comparator ───────────────────────────────────────────
  router.get('/compare', auth, featureGate('player_comparator'), async (req: Request, res: Response) => {
    const ids = (req.query['playerIds'] as string ?? '').split(',').filter(Boolean);
    if (ids.length < 2) { res.status(422).json({ data: null, success: false, message: 'Al menos 2 playerIds separados por coma' }); return; }
    const result = await pool.query(
      `SELECT p.id AS "playerId", p.name, p.position, t.name AS "teamName",
              COALESCE((SELECT SUM(ms.points)::int FROM match_scorers ms WHERE ms.player_id = p.id), 0) AS "goals",
              COALESCE((SELECT COUNT(DISTINCT m.id)::int FROM matches m WHERE m.status='finished' AND (m.home_team_id=t.id OR m.away_team_id=t.id)), 0) AS "matches",
              COALESCE((SELECT COUNT(*)::int FROM match_sanctions msan JOIN sanction_types st ON st.id=msan.sanction_type_id WHERE msan.player_id=p.id AND st.code='YELLOW'), 0) AS "yellows",
              COALESCE((SELECT COUNT(*)::int FROM match_sanctions msan JOIN sanction_types st ON st.id=msan.sanction_type_id WHERE msan.player_id=p.id AND st.code='RED'), 0) AS "reds",
              u.birth_date AS "birthDate"
       FROM players p JOIN teams t ON t.id = p.team_id LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = ANY($1)`,
      [ids],
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  // ── Analytics Dashboard ─────────────────────────────────────────
  router.get('/analytics/:tournamentId', auth, featureGate('analytics_dashboard'), async (req: Request, res: Response) => {
    const tid = req.params['tournamentId'];
    const [teamsR, matchesR, playersR, goalsR, sanctionsR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM teams WHERE tournament_id = $1 AND is_deleted = false`, [tid]),
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(CASE WHEN status='finished' THEN 1 END)::int AS finished, COUNT(CASE WHEN status='in_progress' THEN 1 END)::int AS live FROM matches m JOIN phases ph ON ph.id = m.phase_id WHERE ph.tournament_id = $1`, [tid]),
      pool.query(`SELECT COUNT(*)::int AS count FROM players p JOIN teams t ON t.id = p.team_id WHERE t.tournament_id = $1`, [tid]),
      pool.query(`SELECT COALESCE(SUM(ms.points), 0)::int AS total FROM match_scorers ms JOIN matches m ON m.id = ms.match_id JOIN phases ph ON ph.id = m.phase_id WHERE ph.tournament_id = $1`, [tid]),
      pool.query(`SELECT COUNT(*)::int AS total FROM match_sanctions msan JOIN matches m ON m.id = msan.match_id JOIN phases ph ON ph.id = m.phase_id WHERE ph.tournament_id = $1`, [tid]),
    ]);
    res.json({
      data: {
        teams: (teamsR.rows[0] as Record<string, number>)['count'],
        matches: matchesR.rows[0],
        players: (playersR.rows[0] as Record<string, number>)['count'],
        totalGoals: (goalsR.rows[0] as Record<string, number>)['total'],
        totalSanctions: (sanctionsR.rows[0] as Record<string, number>)['total'],
      }, success: true, message: '',
    });
  });

  // ── Push Notifications (FCM tokens) ─────────────────────────────
  router.post('/push/register', auth, featureGate('push_notifications'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { token, platform } = req.body as { token: string; platform?: string };
    if (!token) { res.status(422).json({ data: null, success: false, message: 'token requerido' }); return; }
    await pool.query(
      `INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, token) DO UPDATE SET is_active = true, last_used_at = NOW()`,
      [userId, token, platform ?? 'web'],
    );
    res.json({ data: null, success: true, message: 'Token registrado' });
  });

  router.delete('/push/unregister', auth, featureGate('push_notifications'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { token } = req.body as { token: string };
    await pool.query(`UPDATE push_tokens SET is_active = false WHERE user_id = $1 AND token = $2`, [userId, token]);
    res.json({ data: null, success: true, message: 'Token desactivado' });
  });

  // ── Ad Spaces (sponsors) ────────────────────────────────────────
  router.get('/sponsors/:tournamentId', auth, featureGate('ad_spaces'), async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT * FROM ad_spaces WHERE tournament_id = $1 AND is_active = true ORDER BY created_at`, [req.params['tournamentId']],
    );
    res.json({ data: result.rows, success: true, message: '' });
  });

  router.post('/sponsors', auth, featureGate('ad_spaces'), async (req: Request, res: Response) => {
    const { tournamentId, sponsorName, logoUrl, websiteUrl, placement, startsAt, endsAt } = req.body as Record<string, unknown>;
    if (!tournamentId || !sponsorName) { res.status(422).json({ data: null, success: false, message: 'tournamentId y sponsorName requeridos' }); return; }
    const result = await pool.query(
      `INSERT INTO ad_spaces (tournament_id, sponsor_name, logo_url, website_url, placement, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tournamentId, sponsorName, logoUrl ?? null, websiteUrl ?? null, placement ?? 'card_footer', startsAt ?? null, endsAt ?? null],
    );
    res.json({ data: result.rows[0], success: true, message: 'Patrocinador agregado' });
  });

  router.delete('/sponsors/:id', auth, featureGate('ad_spaces'), async (req: Request, res: Response) => {
    await pool.query(`DELETE FROM ad_spaces WHERE id = $1`, [req.params['id']]);
    res.json({ data: null, success: true, message: 'Patrocinador eliminado' });
  });

  // ── Shop ────────────────────────────────────────────────────────
  router.get('/shop/products', auth, featureGate('shop'), async (req: Request, res: Response) => {
    const tournamentId = req.query['tournamentId'] as string | undefined;
    const where = tournamentId ? 'WHERE sp.tournament_id = $1 AND sp.is_active = true' : 'WHERE sp.is_active = true';
    const result = await pool.query(`SELECT * FROM shop_products sp ${where} ORDER BY sp.name`, tournamentId ? [tournamentId] : []);
    res.json({ data: result.rows, success: true, message: '' });
  });

  router.post('/shop/products', auth, featureGate('shop'), async (req: Request, res: Response) => {
    const { tournamentId, name, description, priceCop, imageUrl, category, stock } = req.body as Record<string, unknown>;
    if (!name || !priceCop) { res.status(422).json({ data: null, success: false, message: 'name y priceCop requeridos' }); return; }
    const result = await pool.query(
      `INSERT INTO shop_products (tournament_id, name, description, price_cop, image_url, category, stock) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tournamentId ?? null, name, description ?? null, priceCop, imageUrl ?? null, category ?? null, stock ?? 0],
    );
    res.json({ data: result.rows[0], success: true, message: 'Producto creado' });
  });

  router.post('/shop/orders', auth, featureGate('shop'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const { items, shippingAddress, notes } = req.body as { items: Array<{ productId: string; quantity: number }>; shippingAddress?: string; notes?: string };
    if (!items?.length) { res.status(422).json({ data: null, success: false, message: 'items requerido' }); return; }
    // Calculate total
    let total = 0;
    const itemDetails: Array<{ productId: string; quantity: number; unitPrice: number }> = [];
    for (const item of items) {
      const p = await pool.query(`SELECT price_cop FROM shop_products WHERE id = $1 AND is_active = true`, [item.productId]);
      if (!p.rows[0]) { res.status(422).json({ data: null, success: false, message: `Producto ${item.productId} no encontrado` }); return; }
      const price = (p.rows[0] as { price_cop: number }).price_cop;
      total += price * item.quantity;
      itemDetails.push({ productId: item.productId, quantity: item.quantity, unitPrice: price });
    }
    const order = await pool.query(
      `INSERT INTO shop_orders (user_id, total_cop, shipping_address, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [userId, total, shippingAddress ?? null, notes ?? null],
    );
    const orderId = (order.rows[0] as { id: string }).id;
    for (const item of itemDetails) {
      await pool.query(`INSERT INTO shop_order_items (order_id, product_id, quantity, unit_price_cop) VALUES ($1,$2,$3,$4)`, [orderId, item.productId, item.quantity, item.unitPrice]);
    }
    res.json({ data: { ...order.rows[0], items: itemDetails }, success: true, message: 'Orden creada' });
  });

  // ── Data Export (GDPR/Habeas Data) ──────────────────────────────
  router.get('/data-export/my-data', auth, featureGate('data_export'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const [user, players, predictions, posts] = await Promise.all([
      pool.query(`SELECT id, name, email, phone, birth_date, document_type, document_number, city, created_at FROM users WHERE id = $1`, [userId]),
      pool.query(`SELECT p.*, t.name AS "teamName" FROM players p JOIN teams t ON t.id = p.team_id WHERE p.user_id = $1`, [userId]),
      pool.query(`SELECT * FROM predictions WHERE user_id = $1`, [userId]),
      pool.query(`SELECT id, content, image_url, created_at FROM social_posts WHERE user_id = $1 AND is_deleted = false`, [userId]),
    ]);
    res.json({
      data: { user: user.rows[0], players: players.rows, predictions: predictions.rows, posts: posts.rows, exportedAt: new Date().toISOString() },
      success: true, message: 'Datos exportados (Habeas Data)',
    });
  });

  // Right to be forgotten
  router.delete('/data-export/my-data', auth, featureGate('data_export'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    // Anonymize user data
    await pool.query(
      `UPDATE users SET name = 'Usuario eliminado', email = $1, phone = NULL, photo_url = NULL, birth_date = NULL, document_number = NULL, is_active = false WHERE id = $2`,
      [`deleted_${userId}@olimpicapp.local`, userId],
    );
    await pool.query(`UPDATE social_posts SET is_deleted = true WHERE user_id = $1`, [userId]);
    res.json({ data: null, success: true, message: 'Datos anonimizados (derecho al olvido)' });
  });

  // ── Public API key management ───────────────────────────────────
  router.post('/api-keys', auth, featureGate('public_api'), async (req: Request, res: Response) => {
    const userId = req.headers['x-user-id'] as string;
    const crypto = await import('crypto');
    const apiKey = `olp_${crypto.randomBytes(24).toString('hex')}`;
    // Store hashed (we return the key only once)
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
    await pool.query(
      `INSERT INTO webhook_subscriptions (user_id, url, events, secret) VALUES ($1, 'api-key', '["api_access"]', $2)`,
      [userId, hash],
    );
    res.json({ data: { apiKey, message: 'Guarda esta clave — no se mostrará de nuevo' }, success: true, message: 'API key generada' });
  });

  return router;
}
