# Changelog — main

## [No publicado]

### Agregado
- Se creó microservicio de anuncios (`@tournament/announcements`) en puerto 3007 con CRUD completo, validación Zod y roles
- Se creó microservicio de pagos (`@tournament/payments`) en puerto 3008 con CRUD completo, validación Zod y roles
- Se creó microservicio de galería (`@tournament/gallery`) en puerto 3009 con operaciones GET/POST/DELETE, validación Zod y roles

### Seguridad
- Se implementó protección brute-force en login: max 5 intentos por email en 15 min, lockout de 15 min, respuesta 429 con Retry-After (`login-rate-limit.middleware.ts`)
- Se activó Content Security Policy (CSP) en Helmet: `default-src 'self'`, `script-src 'self'`, inline styles para Angular, WebSocket y Firebase en connect-src, frames y objects bloqueados
- Se implementó refresh token con rotación: tabla `refresh_tokens`, hash SHA-256 almacenado, revocación en logout/change-password, endpoint `POST /auth/refresh`
- Se creó flujo de recuperación de contraseña: tabla `password_reset_tokens`, endpoints `POST /auth/forgot-password` y `POST /auth/reset-password`, tokens de un solo uso con expiración de 1 hora
- Se refactorizó `auth.routes.ts` a factory pattern (`buildAuthRouter(pool)`) para usar el pool compartido de DB, eliminando la instancia duplicada de conexiones

### Agregado
- Se creó migración `1749600036000_create-refresh-tokens.js`: tablas `refresh_tokens` y `password_reset_tokens` con índices y constraints
- Se creó middleware `login-rate-limit.middleware.ts`: tracking en memoria con limpieza periódica, funciones exportadas `recordFailedAttempt`, `resetAttempts`, `isLockedOut`
- Se agregó endpoint `POST /auth/refresh` para renovar sesión sin re-login
- Se agregó endpoint `POST /auth/forgot-password` con prevención de enumeración de emails
- Se agregó endpoint `POST /auth/reset-password` con validación de token y revocación de refresh tokens

### Cambiado
- `server-unified.ts`: importa `buildAuthRouter` en vez de `authRouter`, construye auth router con pool compartido
- `server-unified.ts`: Helmet configurado con CSP completo en vez de `contentSecurityPolicy: false`
- Cookie de acceso ahora tiene `maxAge: 1h` (alineado con JWT expiry), refresh cookie en path `/auth` con `maxAge: 7d`

### Agregado
- Se creó `Dockerfile` multi-stage (builder + runner, `node:20-alpine`): compila TypeScript en el stage builder, instala solo dependencias de producción en el runner, usuario no-root `olimpic`, health check integrado
- Se creó `.dockerignore`: excluye `node_modules`, `dist-unified`, `.env`, archivos de test, `.git`, y herramientas de DB del contexto de imagen
- Se crearon tests unitarios para el gateway (`src/middleware/login-rate-limit.test.ts`): 9 tests cubriendo `recordFailedAttempt`, `isLockedOut` y `resetAttempts` incluyendo case-insensitivity
- Se crearon tests unitarios para esquemas de auth (`src/routes/auth.schemas.test.ts`): 15 tests cubriendo `loginSchema`, `forgotPasswordSchema`, `resetPasswordSchema` y `changePasswordSchema`
- Se agregó `vitest@3.2.1` a `services/gateway` con script `test` y `vitest.config.ts`
- Se agregó `PagedResult<T>` a `@tournament/shared` (`shared/src/types/index.ts`) para tipado consistente de respuestas paginadas

### Cambiado
- **Paginación real en backend**: `TournamentsRepository.findAll`, `TeamsRepository.findAll` y `MatchesRepository.findAll` ahora usan `COUNT(*) OVER()` + `LIMIT/OFFSET` — devuelven `PagedResult<T>` con `{data, total, page, pageSize}`
- `TournamentsService.getAll`, `TeamsService.getAll` y `MatchesService.getAll` retornan `PagedResult<T>` en vez de arrays
- Routers de tournaments, teams y matches: endpoint `GET /` devuelve `{data, total, page, pageSize}` en lugar de solo `{data}`
- `TeamsRepository.findAll`: corregido bug de índice incorrecto en parámetros LIMIT/OFFSET del query
- `backend/.github/workflows/ci.yml`: se agregó paso `Test gateway` al final del pipeline de CI

### Verificado como ya implementado
- PWA: `manifest.webmanifest`, `sw.js` con estrategias cache-first/network-first, registro en `index.html` — ya estaba completo
- Frontend CI: `frontend/.github/workflows/ci.yml` ya existía con build production + check bundle size

### Seguridad
- Se refactorizó `authorization.middleware.ts` a factory pattern (`buildAuthorizationMiddleware(pool)`) — elimina pool duplicado, reutiliza el pool compartido de `server-unified.ts`
- Se agregó header `Retry-After` en la respuesta 429 del rate-limit global, con segundos restantes del window y mensaje en español

### Agregado
- Se creó tabla `audit_log` (migración `1749600037000`): registra INSERT/UPDATE/DELETE con `old_data`, `new_data` (JSONB), `performed_by`, `performed_at`, y `metadata`
- Se agregó columna `modified_by` (UUID FK → users) a tablas `tournaments`, `teams` y `matches`
- Se creó `AuditService` en `@tournament/shared` (`shared/src/audit/audit.service.ts`): métodos `log()` y `logBatch()` para insertar en `audit_log` de forma no-blocking
- Se creó endpoint `GET /teams/:id/players/:playerId/stats` — retorna estadísticas agregadas por jugador: goles, tarjetas, partidos jugados, promedio por partido, cambios, y ratio V/E/D

### Cambiado
- `server-unified.ts`: usa `buildAuthorizationMiddleware(pool)` en vez de importar middleware estáticos (elimina pool duplicado)
- `rate-limit.middleware.ts`: custom handler con `Retry-After` header y respuesta JSON en español

### Agregado
- Se integró `AuditService` en los routers de tournaments, teams y matches: cada POST/PUT/DELETE registra la acción en `audit_log` con `performed_by` del usuario autenticado
- Se creó `email.service.ts` en gateway: envía emails transaccionales vía SMTP (Nodemailer) en producción, log en desarrollo
- Se creó función `sendPasswordResetEmail` con template HTML responsive para el enlace de reset
- Se creó migración `1749600038000_add-composite-indexes`: 6 índices compuestos para `matches`, `match_events`, `match_scorers`, `match_sanctions` y `standings`
- Se agregaron variables SMTP al `.env.example` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `FRONTEND_URL`)

### Cambiado
- `buildTournamentsRouter`, `buildTeamsRouter`, `buildMatchesRouter`: aceptan segundo parámetro opcional `AuditService` para audit logging
- `server-unified.ts`: instancia `AuditService` con pool compartido y lo pasa a los 3 routers principales
- `auth.routes.ts` → `forgot-password`: reemplazado TODO por llamada real a `sendPasswordResetEmail()`

### Seguridad
- Se creó módulo de sanitización HTML (`shared/src/sanitize/sanitize.ts`): funciones `stripHtml()` (elimina todo tag) y `sanitizeHtml()` (allowlist: b, i, em, strong, u, br, p, ul, ol, li, a)
- Se integró `stripHtml()` en mensajes de chat (WebSocket): todo contenido se sanitiza antes de persistir
- Se integró `sanitizeHtml()` en el router de announcements (POST y PUT): permite formato inline pero elimina scripts/eventos

### Agregado
- Health endpoint enriquecido: `/health/live` (liveness — siempre responde), `/health/ready` (readiness — verifica DB), `/health` (detallado — pool stats, memory, uptime, version)
- Se creó tabla `seasons` (migración `1749600039000`): agrupa torneos por temporada con nombre, slug, fechas, y flag `is_active`
- Se agregó columna `season_id` (UUID FK → seasons) en `tournaments` para vincular torneos a temporadas históricas
- Se creó módulo `shared/src/sanitize/sanitize.ts` exportado desde `@tournament/shared`

### Cambiado
- `MatchesRepository.finishMatch`: envuelto en transacción explícita (BEGIN/COMMIT/ROLLBACK) — si falla cualquier paso, el match permanece en `in_progress`
- `TournamentsRepository.deletePhase`: ahora permite eliminar fases con partidos solo-programados (los elimina automáticamente), pero bloquea eliminación si hay partidos `in_progress` o `finished`
- Mensaje de error en eliminación de fase mejorado: ahora indica en español qué hacer

### Agregado
- Se creó `CircuitBreaker` en `@tournament/shared` (`shared/src/resilience/circuit-breaker.ts`): estados CLOSED/OPEN/HALF_OPEN, configurable por threshold y recovery timeout, métodos `exec()` y `execWithFallback()`
- Se creó `writeLoggerMiddleware` que registra todas las operaciones de escritura (POST/PUT/PATCH/DELETE) con userId, correlationId, statusCode y duración en ms
- Se creó migración `1749600040000_add-soft-delete`: columnas `is_deleted`, `deleted_at`, `deleted_by` en tournaments y teams, con partial indexes para registros activos

### Cambiado
- `TournamentsRepository.delete`: ahora realiza soft-delete (SET is_deleted = true) en vez de DELETE físico
- `TournamentsRepository.findAll`: filtra automáticamente registros con `is_deleted = false`
- `TeamsRepository.delete`: ahora realiza soft-delete; solo bloquea si hay partidos `in_progress` (antes bloqueaba con cualquier match)
- `TeamsRepository.findAll`: filtra automáticamente registros con `is_deleted = false`
- `server-unified.ts`: se agregó `writeLoggerMiddleware` global después de `express.json`

### Agregado
- Se creó `contentTypeMiddleware`: valida que POST/PUT/PATCH tengan `Content-Type: application/json` o `multipart/form-data`; retorna 415 si es inválido
- Se creó `apiVersionMiddleware`: agrega header `X-API-Version: 1.1.0` a todas las respuestas para detección de versión en clientes
- Se agregó `statement_timeout: 30s` e `idle_in_transaction_session_timeout: 60s` al pool de PostgreSQL para prevenir queries runaway

### Cambiado
- Graceful shutdown mejorado: timeout de 15s para drain, logging de progreso por fase (HTTP close, DB close), force-exit si se excede el timeout
- Orden de middleware actualizado: `apiVersionMiddleware` después de correlationMiddleware, `contentTypeMiddleware` después de `express.json`

### Agregado
- Se creó endpoint `POST /tournaments/:id/advance-knockout` — avanza fase eliminatoria: toma ganadores de la ronda actual y crea partidos de la siguiente ronda (semifinal → final). Opcionalmente crea partido por 3er puesto con los perdedores
- Se creó endpoint `POST /tournaments/:id/cups/:cupId/generate` — genera eliminatoria por copa: filtra equipos por rango de posiciones del grupo (e.g., Copa Oro posiciones 1-2, Copa Plata posiciones 3-4) con seeding cruzado entre grupos (1A vs 2B, 1B vs 2A)
- Se agregó parámetro opcional `?phaseId=X` a `GET /matches/scorers` y `GET /matches/sanctions` para filtrar estadísticas por fase/copa específica
- Se creó namespace WebSocket público `/spectator` sin autenticación: permite a espectadores anónimos recibir actualizaciones en tiempo real de marcadores y posiciones (events: `match:score_update`, `match:finished`, `standings:refresh`)
- Se implementó broadcast de eventos de standings al namespace público `/spectator` automáticamente cuando un árbitro finaliza un partido

### Cambiado
- `findTournamentSanctions` y `findTournamentScorers`: aceptan `phaseId` opcional con queries parametrizadas (seguras contra SQL injection)
- Las funcionalidades de generación automática (`generate-fixture`, `generate-knockout`, `cups/:cupId/generate`, `advance-knockout`) coexisten con la creación manual (`POST /phases`, `POST /matches`) — el organizador puede elegir entre ambos modos

### Agregado
- Se creó tabla `venue_courts` (migración `1749600041000`): sub-espacios dentro de una sede (un coliseo puede tener 2+ canchas). Campos: `venue_id`, `tournament_id`, `name`, `court_number`, `is_active`
- Se agregó columna `venue_court_id` (UUID FK → venue_courts) en `matches` para vincular un partido a un espacio específico
- Se agregaron campos de configuración de descanso en `tournaments`: `enable_rest_validation` (boolean, default false) y `min_rest_between_matches` (integer, minutos)
- Se creó `SchedulingValidator` en `@tournament/shared` (`shared/src/scheduling/scheduling-validator.ts`): valida conflictos de cancha (solapamiento de horario), descanso mínimo entre partidos de un equipo, y disponibilidad de árbitros
- Se creó endpoint `POST /tournaments/:id/auto-draw`: sorteo automático de grupos con modos `random` (aleatorio), `serpentine` (snake draft) y `seeded` (distribución por pots). Distribuye equipos equitativamente. Resultado modificable después con drag-and-drop (manual override vía POST /groups)
- Se crearon endpoints `GET/POST /tournaments/:id/venues/:venueId/courts` para gestionar sub-espacios por sede
- Comentario en POST /groups: clarifica que es la opción manual (drag-and-drop) que coexiste con auto-draw

### Cambiado
- `num_venues` constraint ampliado conceptualmente: ahora cada venue puede tener múltiples courts (un coliseo dividido en 2 espacios = 1 venue, 2 courts)

### Agregado
- Se agregó campo `club_name` (varchar 200) a la tabla `teams`: identifica a qué club pertenece un equipo (e.g., "Club Deportivo Juventud CEDIJ"). Equipos con el mismo club_name son del mismo club
- Se agregó campo `enforce_club_separation` (boolean, default true) a `tournaments`: cuando está activo, el sorteo automático garantiza que equipos del mismo club queden en grupos diferentes
- Algoritmo de separación por club en `autoDrawGroups`: agrupa equipos por club, los distribuye primero en grupos diferentes (constraint-satisfaction), valida que ningún club tenga más equipos que grupos disponibles
- Se actualizó `createTeamSchema` y `CreateTeamInput` para incluir `clubName` como campo opcional

### Cambiado
- `autoDrawGroups`: ahora distingue entre distribución con separación de club (constraint-aware) y distribución simple. Retorna también `clubName` en la respuesta para que el frontend muestre la afiliación al club
- La creación de equipos (`POST /teams`) ahora acepta `clubName` opcional en el body

### Cambiado
- `enrollTeam` (inscripción pública): ahora acepta campos adicionales: `clubName`, `imageUrl`, `colorPrimary`, `colorSecondary`, `instagramUrl`, `facebookUrl`, `tiktokUrl`, `youtubeUrl`
- Algoritmo de separación por club: ya no lanza error cuando un club tiene más equipos que grupos — distribuye de la mejor manera posible y retorna `warnings[]` en la respuesta
- `autoDrawGroups` respuesta: ahora incluye `{ groups, warnings }` donde warnings contiene advertencias de separación parcial

### Agregado
- Se creó migración `1749600043000_expand-players-enrollment`: agrega a tabla `players` los campos `document_type`, `document_number`, `email`, `phone`, `birth_date`, `photo_url`, `document_front_url`, `document_back_url`, `eps_file_url`
- Inscripción pública ahora crea cuenta de usuario automáticamente para cada jugador que tenga número de documento. Contraseña inicial = número de documento. `must_change_password = true` obliga a cambiarla en el primer ingreso
- Se asigna automáticamente el rol `player` al usuario creado
- Si el jugador ya existe (mismo document_number), se vincula al usuario existente sin crear duplicado

### Cambiado
- Endpoint `POST /tournaments/:id/enroll`: los jugadores ahora aceptan campos completos (documentType, documentNumber, email, phone, birthDate, photoUrl, documentFrontUrl, documentBackUrl, epsFileUrl)
- Los datos del jugador se guardan tanto en la tabla `players` (visibles para el organizador) como en la tabla `users` (para autenticación)

### Corregido
- Se eliminaron campos personales duplicados de la tabla `players` (migración `1749600044000`): `document_type`, `document_number`, `email`, `phone`, `birth_date`, `photo_url`, `document_front_url`, `document_back_url`, `eps_file_url` — estos datos viven exclusivamente en la tabla `users`
- `enrollTeam`: corregido para guardar datos personales SOLO en `users` (la fuente de verdad) y en `players` solo `team_id`, `user_id`, `name`, `jersey_number`, `position`
- Si el jugador ya existe (mismo document_number), se actualizan sus datos en `users` con la info nueva proporcionada (COALESCE: no sobrescribe campos que ya tenían valor)

### Agregado
- Se creó tabla `subscription_plans` (migración `1749600045000`): 3 planes (Básico $49.900, Profesional $149.900, Premium $299.900 COP/mes) con límites de equipos, torneos, canchas y feature flags (chat, gallery, analytics, PDF, inscripción pública, notificaciones, branding, multi-copa)
- Se creó tabla `organizer_invitations`: registro de invitaciones enviadas por admin a organizadores
- Se agregaron campos `plan_id` y `subscription_expires_at` a la tabla `users` para asignación de plan
- Se creó endpoint `POST /api/users/invite-organizer` (admin only): crea cuenta de organizador con plan asignado, contraseña temporal, y fecha de expiración. Retorna credenciales al admin para compartir
- Se creó endpoint `PUT /api/users/:id/status` (admin only): activa/desactiva un usuario para controlar acceso
- Se creó endpoint `GET /api/users/plans/available` (público): lista los planes activos para la landing page
- Se creó `planLimitsMiddleware`: valida límites del plan del organizador antes de crear torneos/equipos. Retorna 403 con mensaje de upgrade cuando se excede el límite

### Agregado
- Se creó migración `1749600046000_tournament-lifecycle-rules`: agrega campos `player_change_deadline`, `player_change_max_matchday`, `archive_after_days`, `enrollment_closed_at` a tournaments
- Se creó `tournamentLifecycleMiddleware` que aplica reglas por estado del torneo:
  - **Finalizado/Archivado/Cancelado**: bloquea TODAS las escrituras (modo solo-lectura)
  - **Activo + inscripción cerrada**: bloquea inscripción de nuevos equipos (por fecha límite o cierre explícito)
  - **Activo + deadline de jugadores**: bloquea agregar/cambiar jugadores después de la fecha o jornada configurada
- El admin (rol `admin`) puede saltarse todas las restricciones de lifecycle
- Middleware integrado en rutas de tournaments, teams y matches

### Cambiado
- Rutas `/api/tournaments`, `/api/teams` y `/api/matches`: ahora pasan por `tournamentLifecycleMiddleware` además de los demás middlewares existentes
