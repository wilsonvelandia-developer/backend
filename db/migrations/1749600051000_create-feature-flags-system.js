/**
 * Migration: Create comprehensive feature flags system.
 * Allows features to be toggled per plan (subscription_plans.features JSONB)
 * and introduces a dedicated plan_features table for granular control.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  // Master list of all available features
  pgm.createTable('platform_features', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    code: { type: 'varchar(100)', notNull: true, unique: true },
    name: { type: 'varchar(200)', notNull: true },
    description: { type: 'text' },
    category: { type: 'varchar(50)', notNull: true }, // sports, monetization, engagement, intelligence, operations, scalability
    is_active: { type: 'boolean', default: true },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  // Junction: which features are included in which plan
  pgm.createTable('plan_features', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    plan_id: { type: 'uuid', notNull: true, references: 'subscription_plans(id)', onDelete: 'CASCADE' },
    feature_code: { type: 'varchar(100)', notNull: true },
    is_enabled: { type: 'boolean', default: true },
    config: { type: 'jsonb', default: '{}' }, // feature-specific config (limits, etc.)
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('plan_features', 'uq_plan_features_plan_code', { unique: ['plan_id', 'feature_code'] });
  pgm.createIndex('plan_features', ['plan_id']);
  pgm.createIndex('plan_features', ['feature_code']);

  // Seed all features
  const features = [
    // Sports management
    ['match_sheet', 'Planilla digital de partido', 'Firma digital del árbitro y delegados', 'sports'],
    ['transfers', 'Transferencias de jugadores', 'Control de dorsales y pases entre equipos', 'sports'],
    ['injuries', 'Registro de lesiones', 'Historial de lesiones por jugador', 'sports'],
    ['advanced_stats', 'Estadísticas avanzadas', 'Asistencias, aces, triples y más por deporte', 'sports'],
    ['fair_play', 'Fair Play scoring', 'Puntuación de juego limpio como criterio de desempate', 'sports'],
    // Monetization
    ['payment_gateway', 'Pasarela de pagos', 'PSE, Nequi, Daviplata para inscripciones online', 'monetization'],
    ['ad_spaces', 'Espacios publicitarios', 'Patrocinadores en cards de redes sociales', 'monetization'],
    ['invoicing', 'Facturación electrónica', 'Facturación DIAN para organizadores', 'monetization'],
    ['shop', 'Tienda virtual', 'Camisetas, trofeos y merchandising', 'monetization'],
    // Engagement
    ['predictions', 'Polla de predicciones', 'Los espectadores predicen resultados', 'engagement'],
    ['live_voting', 'Votaciones en vivo', 'MVP del público y mejor jugada', 'engagement'],
    ['social_wall', 'Muro social', 'Feed por torneo con fotos y comentarios', 'engagement'],
    ['referee_ratings', 'Calificación de árbitros', 'Los equipos califican post-partido', 'engagement'],
    ['push_notifications', 'Notificaciones push', 'Firebase Cloud Messaging', 'engagement'],
    // Intelligence
    ['analytics_dashboard', 'Dashboard de analytics', 'Métricas de asistencia, engagement, ingresos', 'intelligence'],
    ['player_comparator', 'Comparador de jugadores', 'Radar chart con métricas lado a lado', 'intelligence'],
    ['elo_rating', 'Rating Elo', 'Predicción de resultados basada en histórico', 'intelligence'],
    ['matchday_report', 'Reporte post-jornada', 'Email automático a entrenadores', 'intelligence'],
    // Operations
    ['qr_checkin', 'Check-in QR', 'Escaneo de carnet de jugadores antes del partido', 'operations'],
    ['attendance', 'Control de asistencia', 'Asistencia a entrenamientos para academias', 'operations'],
    ['uniforms', 'Gestión de uniformes', 'Registro de colores y resolución de conflictos', 'operations'],
    ['calendar_sync', 'Sincronización calendario', 'Google Calendar / iCal', 'operations'],
    ['incidents', 'Reportes de incidentes', 'Agresiones, daños, expulsiones graves', 'operations'],
    // Scalability
    ['multi_tenant', 'Multi-tenant', 'Múltiples organizaciones aisladas', 'scalability'],
    ['public_api', 'API pública', 'OpenAPI para integraciones de terceros', 'scalability'],
    ['webhooks', 'Webhooks', 'Notificar sistemas externos', 'scalability'],
    ['data_export', 'Exportación de datos', 'GDPR/Habeas Data compliance', 'scalability'],
    // Existing features (for backward compat)
    ['live_streaming', 'Transmisión en vivo', 'Transmitir partidos en vivo', 'engagement'],
    ['scouting', 'Cazatalentos', 'Búsqueda y evaluación de jugadores', 'intelligence'],
    ['chat', 'Chat en tiempo real', 'Comunicación entre equipos y organizadores', 'engagement'],
    ['gallery', 'Galería de fotos', 'Fotos y álbumes del torneo', 'engagement'],
    ['social_cards', 'Tarjetas para redes sociales', 'Generación de imágenes compartibles', 'engagement'],
    ['pdf_export', 'Exportación PDF', 'Informes completos del torneo en PDF', 'intelligence'],
    ['public_enrollment', 'Inscripción pública', 'Inscripción online de equipos', 'operations'],
  ];

  for (const [code, name, description, category] of features) {
    pgm.sql(`INSERT INTO platform_features (code, name, description, category) VALUES ('${code}', '${name}', '${description}', '${category}')`);
  }

  // Assign features to existing plans (Básico = minimal, Profesional = most, Premium = all)
  const basicFeatures = ['public_enrollment', 'social_cards', 'pdf_export'];
  const proFeatures = [...basicFeatures, 'live_streaming', 'scouting', 'chat', 'gallery', 'advanced_stats',
    'fair_play', 'predictions', 'push_notifications', 'qr_checkin', 'calendar_sync', 'incidents',
    'analytics_dashboard', 'data_export', 'matchday_report'];
  const premiumFeatures = [...proFeatures, 'match_sheet', 'transfers', 'injuries', 'payment_gateway',
    'ad_spaces', 'invoicing', 'shop', 'live_voting', 'social_wall', 'referee_ratings',
    'player_comparator', 'elo_rating', 'attendance', 'uniforms', 'multi_tenant', 'public_api', 'webhooks'];

  // Insert plan_features for each plan
  pgm.sql(`
    INSERT INTO plan_features (plan_id, feature_code, is_enabled)
    SELECT sp.id, f.code, TRUE
    FROM subscription_plans sp
    CROSS JOIN (VALUES ${basicFeatures.map(f => `('${f}')`).join(',')}) AS f(code)
    WHERE sp.slug = 'basico'
    ON CONFLICT DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO plan_features (plan_id, feature_code, is_enabled)
    SELECT sp.id, f.code, TRUE
    FROM subscription_plans sp
    CROSS JOIN (VALUES ${proFeatures.map(f => `('${f}')`).join(',')}) AS f(code)
    WHERE sp.slug = 'profesional'
    ON CONFLICT DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO plan_features (plan_id, feature_code, is_enabled)
    SELECT sp.id, f.code, TRUE
    FROM subscription_plans sp
    CROSS JOIN (VALUES ${premiumFeatures.map(f => `('${f}')`).join(',')}) AS f(code)
    WHERE sp.slug = 'premium'
    ON CONFLICT DO NOTHING
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('plan_features');
  pgm.dropTable('platform_features');
};
