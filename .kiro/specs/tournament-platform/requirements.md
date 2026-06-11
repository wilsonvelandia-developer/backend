# Requirements — Tournament Platform Backend

## Overview

Multi-sport tournament management platform. Backend composed of Node.js microservices
in TypeScript, communicating with a shared PostgreSQL database. Supports volleyball,
football, basketball, tennis, and other sports with sport-specific rules modeled as
configuration data.

## Functional Requirements

### FR-001 — Multi-Sport Support
- The system must support multiple sports: volleyball, football, basketball, tennis, and others.
- Each sport defines its own rules: number of sets/periods, point limits per set, player count, substitution limits, and rotation rules.
- Sport rules must be configurable data, not hardcoded logic.

### FR-002 — Tournament Management
- Create, update, and delete tournaments.
- A tournament belongs to one sport.
- A tournament has phases (group stage, knockout, round-robin, etc.).
- Each phase has a configurable format.

### FR-003 — Team and Player Management
- Create, update, and delete teams.
- Each team registers players with position, jersey number, and active status.
- Player count per team is validated against the sport's configuration.

### FR-004 — Match Management
- Schedule matches between two teams within a tournament phase.
- Record match results according to sport rules:
  - **Football:** two halves, no point limit per half, result is goals scored.
  - **Volleyball:** configurable number of sets (typically 5), each set has a point limit
    (25 pts, 15 in decisive), team wins set by 2-point margin.
  - **Tennis:** sets with games and tiebreaks, configurable per tournament format.
  - **Basketball:** four quarters, no point limit per quarter.
- A match result must be validated against the sport's scoring rules before being saved.

### FR-005 — Volleyball Rotation Control
- Before a set starts, each team registers the starting lineup with 6 players and their
  court positions (1–6).
- The system tracks and validates rotation order during the set.
- A substitution must respect the rotation: the incoming player takes the exact position
  of the outgoing player in the rotation sequence.
- The system must reject invalid rotations.

### FR-006 — Substitution Management
- Record player substitutions during a match.
- Validate substitution count against sport rules:
  - Football: max 3–5 substitutions (configurable per tournament rules).
  - Volleyball: max 6 substitutions per set per team.
  - Basketball: unlimited substitutions.
  - Tennis: no substitutions.
- Rejected substitutions must return a descriptive error.

### FR-007 — Standings
- Automatically calculate standings per tournament phase after each match result is recorded.
- Standing rules (points per win/draw/loss) are configurable per sport and tournament.

### FR-008 — API Gateway
- Single entry point that routes requests to the appropriate microservice.
- Validates JWT on every request before forwarding.
- Returns standardized error responses.

## Non-Functional Requirements

### NFR-001 — Security
- All endpoints require JWT authentication.
- Authorization validated per resource (ownership/tournament membership).
- No PII exposed in logs or error responses.
- Parameterized queries only — no SQL string concatenation.

### NFR-002 — Scalability
- Each microservice is independently deployable.
- Sport-specific rules are data-driven, not code branches, so new sports require only
  data configuration, not new services.

### NFR-003 — Observability
- Structured JSON logs with correlation IDs on every request.
- Each microservice exposes a `/health` endpoint.

### NFR-004 — Validation
- All inputs validated with Zod schemas before reaching business logic.
- Strict TypeScript types — no `any`.

## Acceptance Criteria

- [ ] A tournament can be created for any configured sport.
- [ ] A volleyball match enforces rotation rules and rejects invalid lineups.
- [ ] A football match records goals per half without a point limit.
- [ ] Substitution limits are enforced per sport rules.
- [ ] Standings are recalculated after every match result update.
- [ ] All endpoints return 401 without a valid JWT.
- [ ] All endpoints return structured error responses with correlation IDs.
