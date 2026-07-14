# Changelog — Tournament Platform Backend

## [No publicado]

### Agregado

#### Feature 1: Log de eventos enriquecido con marcador parcial y notificaciones
- Se agregó columna `partial_score` (jsonb) a la tabla `match_events` — almacena marcador al momento del evento
- Se enriqueció `getEvents` con `player_jersey` del jugador involucrado
- Se creó `NotificationsHelper` para enviar notificaciones a usuarios del torneo en cada evento relevante
- Eventos de sustitución ahora incluyen nombres y números de camiseta de jugadores entrante/saliente en el payload
- Frontend: se muestra marcador parcial junto a cada evento en el timeline

#### Feature 2: Auto-actualización de clasificación al finalizar partido
- Se agregó método `recalculateStandings(phaseId)` al repositorio de matches
- Al finalizar un partido (`finishMatch`), la clasificación de la fase se recalcula automáticamente
- Se envía notificación de resultado final a los usuarios del torneo
- Al actualizar marcador (`updatePeriodScore`), si un equipo gana los sets necesarios se finaliza el partido automáticamente

#### Feature 3: Resultados de voleibol por set en listado de partidos
- Se agregaron campos `homeSetsWon`, `awaySetsWon` y `periods[]` al endpoint `GET /matches`
- Frontend: partidos de voleibol muestran sets ganados como marcador principal (ej. 3-2) y detalle por set debajo

#### Feature 4: Sedes many-to-many con torneos
- Se creó tabla `tournament_venues` (join table) con constraint unique y índices
- Se agregaron endpoints: `GET /venues/by-tournament/:id`, `POST /venues/link`, `POST /venues/unlink`
- Frontend: se permite vincular/desvincular sedes desde la pestaña de sedes del torneo
- Se mantiene compatibilidad con el campo `tournament_id` directo (legacy)

### Cambiado
- Se actualizó constraint `chk_match_events_type` para incluir `set_end`
- Se actualizó `MatchEventItem` en frontend para incluir `partialScore` y `playerJersey`

#### Chat en tiempo real (WebSocket + persistencia)
- Se creó migración 030: tablas `chat_rooms`, `chat_room_members`, `chat_messages` con FK, índices compuestos y constraint de tipo
- Se implementó `chat-handlers.ts` en el gateway WebSocket con eventos: `chat:join`, `chat:openRoom`, `chat:sendMessage`, `chat:createRoom`
- Mensajes persistidos en PostgreSQL con queries parametrizadas
- Rooms con tipos `tournament`, `team`, `direct` y conteo de no leídos por miembro
- Broadcast en tiempo real a todos los miembros de un room vía Socket.IO

#### Generación automática de fase eliminatoria
- Se agregó endpoint `POST /tournaments/:id/generate-knockout` al servicio tournaments
- Toma los top N equipos por grupo desde las standings y genera bracket de eliminación simple
- Algoritmo de seeding estándar (1A vs último clasificado de otro grupo)
- Crea fase "Fase Eliminatoria" con formato `single_elim` y programa partidos con fecha/hora secuencial
- Detecta y reutiliza fase existente (permite re-generación)

#### DevOps — Dockerfiles
- Se creó `services/gateway/Dockerfile` (multi-stage: node:20-alpine, builder + production, USER node)
- Se creó `Dockerfile.service` genérico parametrizable (build-args SERVICE_NAME, SERVICE_PORT) para cualquier microservicio

#### DevOps — CI/CD
- Se creó `.github/workflows/ci.yml` con pipeline: build shared → build all services → run migrations → run tests
- PostgreSQL 15 service container para tests de integración
- Variables de entorno configuradas para entorno CI

#### Chat en tiempo real (WebSocket + persistencia)
- Se creó migración 030: tablas `chat_rooms`, `chat_room_members`, `chat_messages` con FK, índices compuestos y constraint de tipo
- Se implementó `chat-handlers.ts` en el gateway WebSocket con eventos: `chat:join`, `chat:openRoom`, `chat:sendMessage`, `chat:createRoom`
- Mensajes persistidos en PostgreSQL con queries parametrizadas
- Rooms con tipos `tournament`, `team`, `direct` y conteo de no leídos por miembro
- Broadcast en tiempo real a todos los miembros de un room vía Socket.IO

#### Notificaciones in-app
- Se creó migración 031: tabla `notifications` con user_id, type, title, body, reference_type, reference_id, is_read
- Se creó `notifications.routes.ts` con endpoints: GET /api/notifications, PUT /:id/read, PUT /read-all
- Soporte para filtro `unreadOnly` y conteo de no leídas en la respuesta
- Registrado en `app.ts` bajo `authMiddleware`

#### Paginación real en backend
- Se agregó `page` y `pageSize` al schema `listTeamsSchema` (coerce number, default 50, max 100)
- Se agregó `search` filter (ILIKE) al teams repository
- Se actualizó `findAll` con `LIMIT $N OFFSET $M` parametrizados

#### Endpoints de agregados por torneo (Matches service)
- Se agregó `GET /matches/sanctions?tournamentId=X` — sanciones del torneo con jugador, equipo, acumuladas e indicador de suspensión
- Se agregó `GET /matches/scorers?tournamentId=X` — ranking de goleadores con goals, assists, matchesPlayed, goalsPerMatch
- Se agregó `GET /matches/referees?refereeId=X` — historial de asignaciones de un árbitro con datos de partido y torneo
- Se agregaron métodos `findTournamentSanctions`, `findTournamentScorers`, `findRefereeAssignments` al repository con JOINs complejos

#### Filtro de usuarios por rol (Gateway)
- Se agregó query param `role` al endpoint `GET /api/users` — filtra por role_id vía JOIN con user_roles
- Se agregó campo `matchCount` (conteo de match_referees) en la respuesta para mostrar experiencia del árbitro

#### Backend — Microservicios de soporte (Venues, Announcements, Payments, Gallery)
- Se creó servicio `@tournament/venues` (Express 5.1.0, puerto 3006) con CRUD completo
  - Endpoints: GET /venues (filtro por tournamentId, search), GET /venues/:id, POST, PUT, DELETE
  - Validación Zod: nombre requerido, capacity entero positivo, locationUrl URL válida
  - Permisos: lectura para todos, escritura organizer/admin, borrado solo admin
- Se creó servicio `@tournament/announcements` (Express 5.1.0, puerto 3007) con CRUD completo
  - Endpoints: GET /announcements (filtro por tournamentId, priority), GET /:id, POST, PUT, DELETE
  - author_id extraído automáticamente del header x-user-id en creación
  - Permisos: lectura para todos, escritura organizer/admin, borrado solo admin
- Se creó servicio `@tournament/payments` (Express 5.1.0, puerto 3008) con CRUD completo
  - Endpoints: GET /payments (filtro por tournamentId, teamId, status), GET /:id, POST, PUT, DELETE
  - recorded_by extraído automáticamente del header x-user-id en creación
  - Validación: amount > 0, currency 3 chars, method enum
  - Permisos: escritura organizer/admin, borrado solo admin
- Se creó servicio `@tournament/gallery` (Express 5.1.0, puerto 3009) con CRUD
  - Endpoints: GET /gallery (filtro por tournamentId, matchId, teamId), GET /:id, POST, DELETE
  - uploaded_by extraído automáticamente del header x-user-id en creación
  - Permisos: escritura organizer/admin, borrado solo admin

### Cambiado
- Se actualizó gateway `config.ts` con 4 nuevas URLs de servicios (venues, announcements, payments, gallery)
- Se actualizó gateway `proxy.routes.ts` con 4 nuevas rutas proxy: /api/venues, /api/announcements, /api/payments, /api/gallery
- Se actualizó `package.json` raíz: script `build:all` incluye los 4 nuevos servicios
- Se actualizó `.env` y `.env.example` con puertos 3006-3009 y URLs de los nuevos servicios
- Se ejecutó `npm install` en monorepo para resolver dependencias de los nuevos workspaces

#### Swagger / OpenAPI
- Se instaló `swagger-ui-express@5.0.1` y `yaml@2.7.1` en el gateway
- Se creó `src/docs/openapi.yaml` con spec OpenAPI 3.0.3 para todos los endpoints (10 servicios, 30+ endpoints)
- Se montó Swagger UI en `/api-docs` — documentación interactiva pública
- Build script copia YAML a `dist/docs/` automáticamente

#### Tests unitarios
- Se instaló `vitest@3.2.1` en services/venues, services/payments, services/announcements
- Se agregó script `test` y `test:watch` en los 3 servicios
- Se crearon tests de schema Zod: venues (20), payments (18), announcements (21) — total 59 tests
- Todos pasan en < 1s

### Agregado
- Se creó estructura inicial del proyecto con arquitectura de microservicios Node.js + TypeScript
- Se configuró `docker-compose.yml` con PostgreSQL 15 y pgAdmin para entorno de desarrollo local
- Se creó `.env.example` con todas las variables de entorno requeridas por los servicios
- Se configuró `package.json` raíz con npm workspaces para gestión de monorepo
- Se creó `tsconfig.base.json` compartido con configuración strict de TypeScript 5.x
- Se creó paquete `@tournament/shared` con interfaces TypeScript para todos los dominios del sistema
- Se creó jerarquía de errores de aplicación (`AppError`, `NotFoundError`, `ValidationError`, `ForbiddenError`, `UnauthorizedError`, `ConflictError`, `BusinessRuleError`)
- Se crearon specs de requirements, design y tasks en `.kiro/specs/tournament-platform/`
- Se inicializó `.gitignore` con exclusiones para Node.js, TypeScript, Docker y editores

### Agregado — Paso 2: Migraciones
- Se configuró paquete `@tournament/db` con `node-pg-migrate@8.0.4` (versión segura sin vulnerabilidades)
- Se creó migración `1749600000000_create-sports` con tabla de deportes y reglas configurables
- Se creó migración `1749600001000_create-tournaments` con tablas `tournaments` y `phases`
- Se creó migración `1749600002000_create-teams-and-players` con tablas `teams` y `players`
- Se creó migración `1749600003000_create-matches` con tablas `matches` y `match_periods`
- Se creó migración `1749600004000_create-volleyball-rotations` con tabla `volleyball_rotations` y constraints de posición 1-6
- Se creó migración `1749600005000_create-substitutions` con tabla `substitutions`
- Se creó migración `1749600006000_create-standings` con tabla `standings`
- Se creó migración `1749600007000_seed-default-sports` con datos iniciales de Volleyball, Football, Basketball y Tennis
- Se ejecutaron todas las migraciones exitosamente contra PostgreSQL 15 en Docker

### Agregado — Paso 3 & 4: Shared Package + API Gateway
- Se compiló paquete `@tournament/shared` con `composite: true` para soporte de project references
- Se corrigió guard de `Error.captureStackTrace` para compatibilidad con tipos TS strict
- Se creó servicio `@tournament/gateway` (Express 5.1.0, puerto 3000)
- Se implementó `correlationMiddleware` — genera/propaga UUID v4 en cada request
- Se implementó `authMiddleware` — valida JWT HS256, rechaza tokens expirados/inválidos con 401
- Se implementó `rateLimitMiddleware` — 200 req/15min por IP, excluye `/health`
- Se implementó `errorMiddleware` — errores tipados con código, mensaje y correlationId, sin stack traces al cliente
- Se implementaron rutas proxy hacia los 5 microservicios (sports, tournaments, teams, matches, standings)
- Se configuró graceful shutdown con timeout de 10 segundos
- Se verificó: `GET /health` responde 200, rutas protegidas responden 401 sin token
- 0 vulnerabilidades en dependencias del gateway

### Agregado — Paso 5: Servicio Sports
- Se creó servicio `@tournament/sports` (Express 5.1.0, puerto 3001) con arquitectura en capas: router → service → repository
- Se implementó `SportsRepository` con queries parametrizadas para todos los CRUD (sin concatenación de SQL)
- Se implementó `SportsService` como capa de negocio entre router y repositorio
- Se implementaron esquemas Zod con validaciones cross-field (ej: setsToWin requerido cuando hasSets es true)
- Se separó schema base de create/update para permitir `.partial()` sin conflicto con ZodEffects
- Se implementó pool PostgreSQL con health check de conexión en arranque y cierre graceful
- Se verificó: `GET /sports` retorna 4 deportes semlados, validación Zod retorna 422 con detalles por campo
- 0 vulnerabilidades en dependencias del servicio sports

### Agregado — Paso 6: Servicio Tournaments
- Se creó servicio `@tournament/tournaments` (Express 5.1.0, puerto 3002)
- Se implementaron endpoints CRUD completos para torneos con filtros por sportId, status y season
- Se implementaron endpoints CRUD para fases anidadas bajo torneos (`/tournaments/:id/phases`)
- Se validó regla de negocio: no se puede agregar fase a torneo finished
- Se validó regla de negocio: no se puede eliminar torneo con partidos in_progress
- Se validó regla de negocio: no se puede eliminar fase que tiene partidos
- Se verificó conflicto de orden de fase (409) al intentar crear fase con orderIndex duplicado
- 0 vulnerabilidades en dependencias del servicio tournaments

### Agregado — Paso 7: Servicio Teams
- Se creó servicio `@tournament/teams` (Express 5.1.0, puerto 3003)
- Se implementaron endpoints CRUD completos para equipos con filtro por tournamentId
- Se implementaron endpoints CRUD para jugadores anidados bajo equipos (`/teams/:id/players`)
- Se implementó validación de límite de plantel: máximo 3× el número de jugadores por equipo del deporte
- Se implementó query JOIN (teams → tournaments → sports) para obtener reglas del deporte sin acoplamiento directo
- Se validó conflicto de dorsal duplicado (409) dentro del mismo equipo
- Se protegió borrado de jugadores con historial en partidos (sustituciones o rotaciones)
- Se protegió borrado de equipos que tienen partidos programados

### Agregado — Pasos 8, 9 y 10: Matches + Standings + Documentación
- Se creó servicio `@tournament/matches` (Express 5.1.0, puerto 3004) con motor de reglas por deporte
- Se implementó `SportRulesEngine` — validación data-driven sin hardcoding de deportes (extensible)
- Se implementó ciclo de vida de partidos: scheduled → in_progress → finished con transacciones
- Se implementó actualización de marcador con validación de reglas (margen de puntos, sets)
- Se implementó activación automática del siguiente set al cerrar el anterior
- Se implementó registro de alineación de voleibol (6 jugadores, posiciones 1-6 sin duplicados)
- Se implementó rotación de voleibol (sentido horario, posición 1→2→3→4→5→6→1)
- Se implementó validación de sustitución en voleibol (jugador saliente debe estar en rotación)
- Se implementó control de límite de sustituciones (por set en voleibol, por partido en otros)
- Se creó servicio `@tournament/standings` (Express 5.1.0, puerto 3005)
- Se implementó recalculación idempotente de standings con UPSERT transaccional
- Se implementó ordenamiento por puntos, diferencia de sets y diferencia de goles
- Se creó `README.md` con arquitectura, setup completo, referencia de API y flujo de partido
- Se creó colección Postman con todos los endpoints en `postmanCollections/`
- 0 vulnerabilidades en todas las dependencias de los servicios
- 0 vulnerabilidades en dependencias del servicio teams
