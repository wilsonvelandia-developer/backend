# Tasks — Tournament Platform Backend

## Phase 1: Development Environment Setup

- [ ] 1.1 Initialize Git repository and `.gitignore`
- [ ] 1.2 Create `docker-compose.yml` with PostgreSQL 15 and pgAdmin
- [ ] 1.3 Create `.env.example` with required environment variables
- [ ] 1.4 Create root `package.json` for workspace (npm workspaces)
- [ ] 1.5 Create `shared/` package with common types and error classes
- [ ] 1.6 Create base `tsconfig.json` shared across services
- [ ] 1.7 Verify Docker environment starts correctly

## Phase 2: Database Migrations

- [ ] 2.1 Set up `node-pg-migrate` in `db/` directory
- [ ] 2.2 Migration: create `sports` table with all rule columns
- [ ] 2.3 Migration: create `tournaments` and `phases` tables
- [ ] 2.4 Migration: create `teams` and `players` tables
- [ ] 2.5 Migration: create `matches` and `match_periods` tables
- [ ] 2.6 Migration: create `volleyball_rotations` table
- [ ] 2.7 Migration: create `substitutions` table
- [ ] 2.8 Migration: create `standings` table
- [ ] 2.9 Seed: insert default sports (volleyball, football, basketball, tennis)

## Phase 3: Shared Package

- [ ] 3.1 Define shared TypeScript interfaces (Sport, Tournament, Team, Player, Match)
- [ ] 3.2 Define AppError class hierarchy (NotFoundError, ForbiddenError, ValidationError, ConflictError)
- [ ] 3.3 Define standard API response envelope type
- [ ] 3.4 Create logger utility (pino with correlation ID support)
- [ ] 3.5 Create DB pool factory function

## Phase 4: API Gateway Service

- [ ] 4.1 Scaffold gateway service with Express + TypeScript
- [ ] 4.2 Implement correlation ID middleware
- [ ] 4.3 Implement JWT validation middleware
- [ ] 4.4 Implement rate limiting middleware
- [ ] 4.5 Implement proxy routing to each microservice
- [ ] 4.6 Implement global error handler
- [ ] 4.7 Add `/health` endpoint

## Phase 5: Sports Service

- [ ] 5.1 Scaffold sports service
- [ ] 5.2 `GET /sports` — list all sports
- [ ] 5.3 `GET /sports/:id` — get sport with rules
- [ ] 5.4 `POST /sports` — create sport (admin only)
- [ ] 5.5 `PUT /sports/:id` — update sport rules
- [ ] 5.6 Zod schema validation for all endpoints

## Phase 6: Tournaments Service

- [ ] 6.1 Scaffold tournaments service
- [ ] 6.2 `POST /tournaments` — create tournament
- [ ] 6.3 `GET /tournaments` — list tournaments (with filters)
- [ ] 6.4 `GET /tournaments/:id` — get tournament detail
- [ ] 6.5 `PUT /tournaments/:id` — update tournament
- [ ] 6.6 `DELETE /tournaments/:id` — delete tournament
- [ ] 6.7 `POST /tournaments/:id/phases` — add phase
- [ ] 6.8 `PUT /tournaments/:id/phases/:phaseId` — update phase

## Phase 7: Teams Service

- [ ] 7.1 Scaffold teams service
- [ ] 7.2 CRUD for teams (scoped to tournament)
- [ ] 7.3 CRUD for players (scoped to team)
- [ ] 7.4 Validate player count against sport rules on player creation

## Phase 8: Matches Service (most complex)

- [ ] 8.1 Scaffold matches service
- [ ] 8.2 `POST /matches` — schedule a match
- [ ] 8.3 `PUT /matches/:id/start` — start match, initialize periods
- [ ] 8.4 `PUT /matches/:id/periods/:number/score` — update period score with sport rule validation
- [ ] 8.5 `PUT /matches/:id/finish` — finish match, compute winner
- [ ] 8.6 `POST /matches/:id/lineups` — register volleyball starting lineup
- [ ] 8.7 `POST /matches/:id/rotate` — register rotation event for volleyball
- [ ] 8.8 `POST /matches/:id/substitutions` — record substitution with validation
- [ ] 8.9 Sport rule validation engine (injectable strategy per sport)

## Phase 9: Standings Service

- [ ] 9.1 Scaffold standings service
- [ ] 9.2 `GET /standings/:phaseId` — get standings for a phase
- [ ] 9.3 Internal endpoint to recalculate standings after match result update
- [ ] 9.4 Configurable points system per tournament (win/draw/loss points)

## Phase 10: Integration and Testing

- [ ] 10.1 Postman collection for all endpoints
- [ ] 10.2 Unit tests for volleyball rotation validation logic
- [ ] 10.3 Unit tests for substitution limit validation
- [ ] 10.4 Unit tests for standings calculation
- [ ] 10.5 Integration test for complete match flow (volleyball)
- [ ] 10.6 README.md with architecture, endpoints, and setup instructions
