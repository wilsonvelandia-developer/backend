import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

/**
 * Feature Gate Middleware Factory.
 * Validates that the user's plan includes the requested feature before allowing access.
 *
 * Usage: app.use('/api/scouting', featureGate('scouting'), scoutingRouter);
 */
export function buildFeatureGateMiddleware(pool: Pool) {
  // Cache plan features for 5 minutes to avoid per-request DB hits
  const cache = new Map<string, { features: Set<string>; timestamp: number }>();
  const CACHE_TTL_MS = 5 * 60 * 1000;

  async function loadPlanFeatures(planId: string): Promise<Set<string>> {
    const cached = cache.get(planId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.features;
    }

    const result = await pool.query<{ feature_code: string }>(
      `SELECT feature_code FROM plan_features WHERE plan_id = $1 AND is_enabled = TRUE`,
      [planId],
    );

    const features = new Set(result.rows.map((r) => r.feature_code));
    cache.set(planId, { features, timestamp: Date.now() });
    return features;
  }

  /**
   * Returns middleware that checks if the user's plan includes the given feature.
   */
  function featureGate(featureCode: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const userId = req.headers['x-user-id'] as string | undefined;
      const roles = JSON.parse((req.headers['x-user-roles'] as string) ?? '[]') as string[];

      // Admins always have access to all features
      if (roles.includes('admin')) {
        next();
        return;
      }

      if (!userId) {
        res.status(401).json({ data: null, success: false, message: 'No autenticado' });
        return;
      }

      // Get user's plan
      const userResult = await pool.query<{ plan_id: string | null }>(
        `SELECT plan_id FROM users WHERE id = $1`,
        [userId],
      );

      const planId = userResult.rows[0]?.plan_id;
      if (!planId) {
        // No plan = no premium features (only public endpoints)
        res.status(403).json({
          data: null,
          success: false,
          message: `Esta funcionalidad requiere un plan activo. Contacta al administrador.`,
          featureRequired: featureCode,
        });
        return;
      }

      const features = await loadPlanFeatures(planId);
      if (!features.has(featureCode)) {
        res.status(403).json({
          data: null,
          success: false,
          message: `Tu plan no incluye esta funcionalidad. Upgrade necesario.`,
          featureRequired: featureCode,
        });
        return;
      }

      next();
    };
  }

  /** Clears the cache (useful for tests or after plan updates). */
  function clearCache(): void {
    cache.clear();
  }

  return { featureGate, clearCache };
}
