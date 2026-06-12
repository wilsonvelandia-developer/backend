# Changelog — Tournament Platform Backend

## [No publicado]

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
