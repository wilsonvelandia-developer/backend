# Design — Tournament Platform Backend

## Architecture Overview

Microservices architecture with an API Gateway as the single entry point.
Each service owns its domain and communicates with PostgreSQL.

```
Client
  │
  ▼
┌─────────────────────┐
│     API Gateway     │  :3000  — JWT validation, routing, correlation IDs
└──────────┬──────────┘
           │  HTTP (internal network)
    ┌──────┼──────────────────────────────────┐
    ▼      ▼              ▼                   ▼
┌────────┐ ┌───────────┐ ┌────────────┐ ┌──────────┐
│ sports │ │tournaments│ │   teams    │ │ matches  │
│ :3001  │ │  :3002    │ │  :3003     │ │  :3004   │
└────────┘ └───────────┘ └────────────┘ └──────────┘
                                              │
                                         ┌──────────┐
                                         │standings │
                                         │  :3005   │
                                         └──────────┘
    All services connect to:
    ┌─────────────────────┐
    │   PostgreSQL 15     │  :5432
    └─────────────────────┘
```

## Microservices

| Service       | Port | Responsibility                                          |
|---------------|------|---------------------------------------------------------|
| gateway       | 3000 | Auth, routing, rate limiting, correlation IDs           |
| sports        | 3001 | Sport catalog and sport-specific rule configurations    |
| tournaments   | 3002 | Tournaments, phases, and phase formats                  |
| teams         | 3003 | Teams, players, rosters                                 |
| matches       | 3004 | Match scheduling, scoring, rotation control, subs       |
| standings     | 3005 | Standings calculation and retrieval                     |

## Data Model (Key Entities)

### sports
```sql
sports (
  id            UUID PRIMARY KEY,
  name          VARCHAR(100) NOT NULL UNIQUE,  -- 'volleyball', 'football', etc.
  slug          VARCHAR(50)  NOT NULL UNIQUE,
  players_per_team      INT  NOT NULL,
  has_sets              BOOLEAN NOT NULL DEFAULT FALSE,
  sets_to_win           INT,                  -- null if no sets
  points_per_set        INT,                  -- null if no point limit
  decisive_set_points   INT,                  -- e.g. 15 for volleyball 5th set
  win_margin            INT DEFAULT 2,        -- points margin to win a set
  periods_per_match     INT NOT NULL DEFAULT 2,
  max_substitutions     INT,                  -- null = unlimited
  has_rotation          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### tournaments
```sql
tournaments (
  id            UUID PRIMARY KEY,
  sport_id      UUID NOT NULL REFERENCES sports(id),
  name          VARCHAR(200) NOT NULL,
  season        VARCHAR(20),
  status        VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft|active|finished
  max_subs_override INT,  -- overrides sport default for this tournament
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### phases
```sql
phases (
  id            UUID PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id),
  name          VARCHAR(100) NOT NULL,
  format        VARCHAR(30) NOT NULL,  -- 'round_robin'|'single_elim'|'double_elim'
  order_index   INT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### teams
```sql
teams (
  id            UUID PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id),
  name          VARCHAR(200) NOT NULL,
  short_name    VARCHAR(10),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### players
```sql
players (
  id            UUID PRIMARY KEY,
  team_id       UUID NOT NULL REFERENCES teams(id),
  name          VARCHAR(200) NOT NULL,
  jersey_number INT NOT NULL,
  position      VARCHAR(50),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, jersey_number)
)
```

### matches
```sql
matches (
  id            UUID PRIMARY KEY,
  phase_id      UUID NOT NULL REFERENCES phases(id),
  home_team_id  UUID NOT NULL REFERENCES teams(id),
  away_team_id  UUID NOT NULL REFERENCES teams(id),
  scheduled_at  TIMESTAMPTZ,
  status        VARCHAR(20) NOT NULL DEFAULT 'scheduled',  -- scheduled|in_progress|finished
  winner_id     UUID REFERENCES teams(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### match_periods  (halves, sets, quarters)
```sql
match_periods (
  id            UUID PRIMARY KEY,
  match_id      UUID NOT NULL REFERENCES matches(id),
  period_number INT NOT NULL,              -- 1=first half/set, 2=second, etc.
  home_score    INT NOT NULL DEFAULT 0,
  away_score    INT NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  UNIQUE(match_id, period_number)
)
```

### volleyball_rotations  (only for volleyball matches)
```sql
volleyball_rotations (
  id            UUID PRIMARY KEY,
  match_id      UUID NOT NULL REFERENCES matches(id),
  team_id       UUID NOT NULL REFERENCES teams(id),
  set_number    INT NOT NULL,
  position      INT NOT NULL CHECK (position BETWEEN 1 AND 6),
  player_id     UUID NOT NULL REFERENCES players(id),
  rotation_order INT NOT NULL,   -- tracks current rotation state (0–5)
  UNIQUE(match_id, team_id, set_number, position)
)
```

### substitutions
```sql
substitutions (
  id              UUID PRIMARY KEY,
  match_id        UUID NOT NULL REFERENCES matches(id),
  team_id         UUID NOT NULL REFERENCES teams(id),
  period_number   INT NOT NULL,
  player_out_id   UUID NOT NULL REFERENCES players(id),
  player_in_id    UUID NOT NULL REFERENCES players(id),
  minute          INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### standings
```sql
standings (
  id              UUID PRIMARY KEY,
  phase_id        UUID NOT NULL REFERENCES phases(id),
  team_id         UUID NOT NULL REFERENCES teams(id),
  played          INT NOT NULL DEFAULT 0,
  wins            INT NOT NULL DEFAULT 0,
  draws           INT NOT NULL DEFAULT 0,
  losses          INT NOT NULL DEFAULT 0,
  points          INT NOT NULL DEFAULT 0,
  sets_won        INT NOT NULL DEFAULT 0,   -- for set-based sports
  sets_lost       INT NOT NULL DEFAULT 0,
  score_for       INT NOT NULL DEFAULT 0,
  score_against   INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(phase_id, team_id)
)
```

## Project Structure

```
backend/
├── services/
│   ├── gateway/
│   │   ├── src/
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts
│   │   │   │   ├── correlation.middleware.ts
│   │   │   │   └── rate-limit.middleware.ts
│   │   │   ├── routes/
│   │   │   │   └── proxy.routes.ts
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── sports/
│   │   └── src/
│   │       ├── sports/
│   │       │   ├── sports.router.ts
│   │       │   ├── sports.service.ts
│   │       │   ├── sports.repository.ts
│   │       │   ├── sports.schema.ts      (Zod)
│   │       │   └── sports.types.ts
│   │       ├── db/
│   │       │   └── pool.ts
│   │       ├── app.ts
│   │       └── server.ts
│   ├── tournaments/   (same structure pattern)
│   ├── teams/         (same structure pattern)
│   ├── matches/       (same structure pattern — most complex)
│   └── standings/     (same structure pattern)
├── shared/
│   ├── types/
│   │   └── index.ts   (shared TS interfaces)
│   └── errors/
│       └── index.ts   (AppError, NotFoundError, ForbiddenError, ValidationError)
├── db/
│   └── migrations/    (SQL migration files)
├── docker-compose.yml
├── .env.example
└── CHANGELOG.md
```

## Technology Decisions

| Concern           | Choice                  | Reason                                    |
|-------------------|-------------------------|-------------------------------------------|
| Runtime           | Node.js 20 LTS          | Approved stack                            |
| Language          | TypeScript 5.x strict   | Type safety, no `any`                     |
| Framework         | Express 4.x             | Approved, simple, well-known              |
| DB Adapter        | `pg` (node-postgres)    | Approved for Node+PostgreSQL              |
| Validation        | Zod                     | Approved, integrates with TS types        |
| Auth              | JWT + Passport.js       | Approved                                  |
| Security          | Helmet + CORS           | Approved                                  |
| Migrations        | node-pg-migrate         | Approved for Node+PostgreSQL              |
| Containerization  | Docker + docker-compose | Local dev environment                     |
| Logging           | pino                    | Structured JSON logs, high performance    |

## Volleyball Rotation Logic

Rotation state is stored as an integer (0–5) representing how many times the team
has rotated in the current set. Position mapping is:

```
Initial:  [1, 2, 3, 4, 5, 6]  (court positions)
Rotate 1: [6, 1, 2, 3, 4, 5]
Rotate 2: [5, 6, 1, 2, 3, 4]
```

On substitution: the incoming player inherits the outgoing player's position in the
rotation sequence. The sequence itself does not change — only the player occupying
that slot changes. This preserves legal rotation order.

Validation rules:
1. Lineup must have exactly 6 players, all belonging to the team.
2. Positions 1–6 must all be assigned (no duplicates).
3. On substitution, the incoming player must not already be on court.
4. Substitution count per team per set cannot exceed sport maximum.
