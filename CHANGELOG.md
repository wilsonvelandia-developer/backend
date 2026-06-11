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
