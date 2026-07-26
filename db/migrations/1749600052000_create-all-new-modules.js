/**
 * Migration: Create all new module tables.
 * Covers: match sheets, transfers, injuries, advanced stats, fair play,
 * predictions, voting, social wall, referee ratings, incidents, 
 * attendance, uniforms, webhooks, Elo ratings, player comparisons.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // ── Match Sheet (planilla digital) ──────────────────────────────
  pgm.createTable('match_sheets', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    match_id: { type: 'uuid', notNull: true, references: 'matches(id)', onDelete: 'CASCADE' },
    referee_signature_url: { type: 'varchar(1000)' },
    home_delegate_signature_url: { type: 'varchar(1000)' },
    away_delegate_signature_url: { type: 'varchar(1000)' },
    home_captain_signature_url: { type: 'varchar(1000)' },
    away_captain_signature_url: { type: 'varchar(1000)' },
    observations: { type: 'text' },
    is_signed: { type: 'boolean', default: false },
    signed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.createIndex('match_sheets', ['match_id'], { unique: true });

  // ── Transfers ───────────────────────────────────────────────────
  pgm.createTable('player_transfers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    player_id: { type: 'uuid', notNull: true, references: 'players(id)' },
    from_team_id: { type: 'uuid', references: 'teams(id)' },
    to_team_id: { type: 'uuid', notNull: true, references: 'teams(id)' },
    tournament_id: { type: 'uuid', notNull: true, references: 'tournaments(id)' },
    transfer_type: { type: 'varchar(30)', notNull: true, default: 'transfer' },
    status: { type: 'varchar(20)', notNull: true, default: 'pending' },
    new_jersey_number: { type: 'integer' },
    reason: { type: 'text' },
    approved_by: { type: 'uuid', references: 'users(id)' },
    approved_at: { type: 'timestamptz' },
    effective_date: { type: 'date' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.createIndex('player_transfers', ['player_id']);
  pgm.createIndex('player_transfers', ['tournament_id']);

  // ── Injuries ────────────────────────────────────────────────────
  pgm.createTable('player_injuries', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    player_id: { type: 'uuid', notNull: true, references: 'players(id)' },
    match_id: { type: 'uuid', references: 'matches(id)' },
    injury_type: { type: 'varchar(100)', notNull: true },
    body_part: { type: 'varchar(100)' },
    severity: { type: 'varchar(20)', default: 'minor' },
    description: { type: 'text' },
    injury_date: { type: 'date', notNull: true },
    estimated_recovery_days: { type: 'integer' },
    actual_return_date: { type: 'date' },
    status: { type: 'varchar(20)', default: 'active' },
    reported_by: { type: 'uuid', references: 'users(id)' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.createIndex('player_injuries', ['player_id']);

  // ── Advanced Stats ──────────────────────────────────────────────
  pgm.createTable('player_match_stats', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    player_id: { type: 'uuid', notNull: true, references: 'players(id)' },
    match_id: { type: 'uuid', notNull: true, references: 'matches(id)', onDelete: 'CASCADE' },
    stat_type: { type: 'varchar(50)', notNull: true },
    value: { type: 'numeric(10,2)', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('player_match_stats', 'uq_player_match_stat', { unique: ['player_id', 'match_id', 'stat_type'] });
  pgm.createIndex('player_match_stats', ['match_id']);

  // ── Fair Play ───────────────────────────────────────────────────
  pgm.createTable('fair_play_scores', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    team_id: { type: 'uuid', notNull: true, references: 'teams(id)' },
    match_id: { type: 'uuid', notNull: true, references: 'matches(id)', onDelete: 'CASCADE' },
    punctuality_score: { type: 'integer', default: 0 },
    sportsmanship_score: { type: 'integer', default: 0 },
    uniform_score: { type: 'integer', default: 0 },
    discipline_score: { type: 'integer', default: 0 },
    total_score: { type: 'integer', default: 0 },
    notes: { type: 'text' },
    scored_by: { type: 'uuid', references: 'users(id)' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('fair_play_scores', 'uq_fair_play_team_match', { unique: ['team_id', 'match_id'] });

  // ── Predictions (Polla) ─────────────────────────────────────────
  pgm.createTable('prediction_pools', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tournament_id: { type: 'uuid', notNull: true, references: 'tournaments(id)' },
    name: { type: 'varchar(200)', notNull: true },
    is_active: { type: 'boolean', default: true },
    points_exact: { type: 'integer', default: 3 },
    points_winner: { type: 'integer', default: 1 },
    points_wrong: { type: 'integer', default: 0 },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.createTable('predictions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    pool_id: { type: 'uuid', notNull: true, references: 'prediction_pools(id)', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)' },
    match_id: { type: 'uuid', notNull: true, references: 'matches(id)' },
    predicted_home_score: { type: 'integer', notNull: true },
    predicted_away_score: { type: 'integer', notNull: true },
    points_earned: { type: 'integer', default: 0 },
    is_evaluated: { type: 'boolean', default: false },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('predictions', 'uq_prediction_user_match', { unique: ['pool_id', 'user_id', 'match_id'] });
  pgm.createIndex('predictions', ['pool_id', 'user_id']);

  // ── Live Voting ─────────────────────────────────────────────────
  pgm.createTable('live_polls', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    match_id: { type: 'uuid', notNull: true, references: 'matches(id)' },
    question: { type: 'varchar(300)', notNull: true },
    poll_type: { type: 'varchar(30)', default: 'mvp' },
    is_active: { type: 'boolean', default: true },
    closes_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.createTable('live_poll_options', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    poll_id: { type: 'uuid', notNull: true, references: 'live_polls(id)', onDelete: 'CASCADE' },
    label: { type: 'varchar(200)', notNull: true },
    player_id: { type: 'uuid', references: 'players(id)' },
    votes_count: { type: 'integer', default: 0 },
  });

  pgm.createTable('live_poll_votes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    poll_id: { type: 'uuid', notNull: true, references: 'live_polls(id)', onDelete: 'CASCADE' },
    option_id: { type: 'uuid', notNull: true, references: 'live_poll_options(id)', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('live_poll_votes', 'uq_poll_vote_user', { unique: ['poll_id', 'user_id'] });

  // ── Social Wall ─────────────────────────────────────────────────
  pgm.createTable('social_posts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tournament_id: { type: 'uuid', notNull: true, references: 'tournaments(id)' },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)' },
    team_id: { type: 'uuid', references: 'teams(id)' },
    content: { type: 'text', notNull: true },
    image_url: { type: 'varchar(1000)' },
    likes_count: { type: 'integer', default: 0 },
    comments_count: { type: 'integer', default: 0 },
    is_pinned: { type: 'boolean', default: false },
    is_deleted: { type: 'boolean', default: false },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.createIndex('social_posts', ['tournament_id', 'created_at']);

  pgm.createTable('social_post_likes', {
    post_id: { type: 'uuid', notNull: true, references: 'social_posts(id)', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('social_post_likes', 'pk_social_post_likes', { primaryKey: ['post_id', 'user_id'] });

  pgm.createTable('social_post_comments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    post_id: { type: 'uuid', notNull: true, references: 'social_posts(id)', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)' },
    content: { type: 'text', notNull: true },
    is_deleted: { type: 'boolean', default: false },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  // ── Referee Ratings ─────────────────────────────────────────────
  pgm.createTable('referee_ratings', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    match_id: { type: 'uuid', notNull: true, references: 'matches(id)' },
    referee_user_id: { type: 'uuid', notNull: true, references: 'users(id)' },
    rated_by_user_id: { type: 'uuid', notNull: true, references: 'users(id)' },
    rated_by_team_id: { type: 'uuid', references: 'teams(id)' },
    impartiality_score: { type: 'integer', notNull: true },
    knowledge_score: { type: 'integer', notNull: true },
    communication_score: { type: 'integer', notNull: true },
    overall_score: { type: 'integer', notNull: true },
    comment: { type: 'text' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('referee_ratings', 'uq_referee_rating_team', { unique: ['match_id', 'referee_user_id', 'rated_by_team_id'] });

  // ── Incidents ───────────────────────────────────────────────────
  pgm.createTable('match_incidents', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    match_id: { type: 'uuid', notNull: true, references: 'matches(id)' },
    tournament_id: { type: 'uuid', notNull: true, references: 'tournaments(id)' },
    incident_type: { type: 'varchar(50)', notNull: true },
    severity: { type: 'varchar(20)', default: 'medium' },
    description: { type: 'text', notNull: true },
    involved_players: { type: 'jsonb', default: '[]' },
    involved_teams: { type: 'jsonb', default: '[]' },
    action_taken: { type: 'text' },
    status: { type: 'varchar(20)', default: 'open' },
    reported_by: { type: 'uuid', references: 'users(id)' },
    resolved_by: { type: 'uuid', references: 'users(id)' },
    resolved_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.createIndex('match_incidents', ['tournament_id', 'status']);

  // ── Attendance (entrenamientos) ─────────────────────────────────
  pgm.createTable('training_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    team_id: { type: 'uuid', notNull: true, references: 'teams(id)' },
    session_date: { type: 'date', notNull: true },
    start_time: { type: 'time' },
    end_time: { type: 'time' },
    venue: { type: 'varchar(200)' },
    notes: { type: 'text' },
    created_by: { type: 'uuid', references: 'users(id)' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.createTable('training_attendance', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    session_id: { type: 'uuid', notNull: true, references: 'training_sessions(id)', onDelete: 'CASCADE' },
    player_id: { type: 'uuid', notNull: true, references: 'players(id)' },
    status: { type: 'varchar(20)', notNull: true, default: 'present' },
    arrived_at: { type: 'time' },
    notes: { type: 'text' },
  });
  pgm.addConstraint('training_attendance', 'uq_attendance_session_player', { unique: ['session_id', 'player_id'] });

  // ── Uniforms ────────────────────────────────────────────────────
  pgm.createTable('team_uniforms', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    team_id: { type: 'uuid', notNull: true, references: 'teams(id)' },
    uniform_type: { type: 'varchar(20)', notNull: true, default: 'home' },
    primary_color: { type: 'varchar(7)' },
    secondary_color: { type: 'varchar(7)' },
    shorts_color: { type: 'varchar(7)' },
    socks_color: { type: 'varchar(7)' },
    image_url: { type: 'varchar(1000)' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('team_uniforms', 'uq_team_uniform_type', { unique: ['team_id', 'uniform_type'] });

  // ── Webhooks ────────────────────────────────────────────────────
  pgm.createTable('webhook_subscriptions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)' },
    tournament_id: { type: 'uuid', references: 'tournaments(id)' },
    url: { type: 'varchar(1000)', notNull: true },
    events: { type: 'jsonb', notNull: true, default: '[]' },
    secret: { type: 'varchar(200)' },
    is_active: { type: 'boolean', default: true },
    last_triggered_at: { type: 'timestamptz' },
    failure_count: { type: 'integer', default: 0 },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.createIndex('webhook_subscriptions', ['user_id']);

  pgm.createTable('webhook_logs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    subscription_id: { type: 'uuid', notNull: true, references: 'webhook_subscriptions(id)', onDelete: 'CASCADE' },
    event_type: { type: 'varchar(100)', notNull: true },
    payload: { type: 'jsonb' },
    response_status: { type: 'integer' },
    response_body: { type: 'text' },
    duration_ms: { type: 'integer' },
    success: { type: 'boolean' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.createIndex('webhook_logs', ['subscription_id', 'created_at']);

  // ── Elo Ratings ─────────────────────────────────────────────────
  pgm.createTable('team_elo_ratings', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    team_id: { type: 'uuid', notNull: true, references: 'teams(id)' },
    tournament_id: { type: 'uuid', notNull: true, references: 'tournaments(id)' },
    rating: { type: 'numeric(8,2)', notNull: true, default: 1500 },
    matches_played: { type: 'integer', default: 0 },
    updated_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('team_elo_ratings', 'uq_team_elo_tournament', { unique: ['team_id', 'tournament_id'] });

  // ── QR Check-in ─────────────────────────────────────────────────
  pgm.createTable('match_checkins', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    match_id: { type: 'uuid', notNull: true, references: 'matches(id)' },
    player_id: { type: 'uuid', notNull: true, references: 'players(id)' },
    team_id: { type: 'uuid', notNull: true, references: 'teams(id)' },
    checked_in_by: { type: 'uuid', references: 'users(id)' },
    checked_in_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    method: { type: 'varchar(20)', default: 'qr' },
  });
  pgm.addConstraint('match_checkins', 'uq_checkin_match_player', { unique: ['match_id', 'player_id'] });

  // ── FCM Push Tokens ─────────────────────────────────────────────
  pgm.createTable('push_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    token: { type: 'text', notNull: true },
    platform: { type: 'varchar(20)', default: 'web' },
    is_active: { type: 'boolean', default: true },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    last_used_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('push_tokens', 'uq_push_token', { unique: ['user_id', 'token'] });

  // ── Ad Spaces (sponsors) ────────────────────────────────────────
  pgm.createTable('ad_spaces', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tournament_id: { type: 'uuid', notNull: true, references: 'tournaments(id)' },
    sponsor_name: { type: 'varchar(200)', notNull: true },
    logo_url: { type: 'varchar(1000)' },
    website_url: { type: 'varchar(1000)' },
    placement: { type: 'varchar(50)', default: 'card_footer' },
    is_active: { type: 'boolean', default: true },
    starts_at: { type: 'date' },
    ends_at: { type: 'date' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.createIndex('ad_spaces', ['tournament_id']);

  // ── Shop (tienda virtual) ───────────────────────────────────────
  pgm.createTable('shop_products', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tournament_id: { type: 'uuid', references: 'tournaments(id)' },
    name: { type: 'varchar(200)', notNull: true },
    description: { type: 'text' },
    price_cop: { type: 'integer', notNull: true },
    image_url: { type: 'varchar(1000)' },
    category: { type: 'varchar(50)' },
    stock: { type: 'integer', default: 0 },
    is_active: { type: 'boolean', default: true },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.createTable('shop_orders', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)' },
    total_cop: { type: 'integer', notNull: true },
    status: { type: 'varchar(20)', default: 'pending' },
    shipping_address: { type: 'text' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.createTable('shop_order_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    order_id: { type: 'uuid', notNull: true, references: 'shop_orders(id)', onDelete: 'CASCADE' },
    product_id: { type: 'uuid', notNull: true, references: 'shop_products(id)' },
    quantity: { type: 'integer', notNull: true, default: 1 },
    unit_price_cop: { type: 'integer', notNull: true },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('shop_order_items');
  pgm.dropTable('shop_orders');
  pgm.dropTable('shop_products');
  pgm.dropTable('ad_spaces');
  pgm.dropTable('push_tokens');
  pgm.dropTable('match_checkins');
  pgm.dropTable('team_elo_ratings');
  pgm.dropTable('webhook_logs');
  pgm.dropTable('webhook_subscriptions');
  pgm.dropTable('team_uniforms');
  pgm.dropTable('training_attendance');
  pgm.dropTable('training_sessions');
  pgm.dropTable('match_incidents');
  pgm.dropTable('referee_ratings');
  pgm.dropTable('social_post_comments');
  pgm.dropTable('social_post_likes');
  pgm.dropTable('social_posts');
  pgm.dropTable('live_poll_votes');
  pgm.dropTable('live_poll_options');
  pgm.dropTable('live_polls');
  pgm.dropTable('predictions');
  pgm.dropTable('prediction_pools');
  pgm.dropTable('fair_play_scores');
  pgm.dropTable('player_match_stats');
  pgm.dropTable('player_injuries');
  pgm.dropTable('player_transfers');
  pgm.dropTable('match_sheets');
};
