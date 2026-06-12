# Tournament Platform — Backend

Multi-sport tournament management platform. Backend composed of independent Node.js microservices in TypeScript, all connected to a shared PostgreSQL 15 database.

## Deportes soportados

| Deporte    | Jugadores | Sistema     | Regla especial                                       |
|------------|-----------|-------------|------------------------------------------------------|
| Volleyball | 6         | Sets (5)    | Rotación de posiciones, 25 pts/set, 15 set decisivo  |
| Football   | 11        | 2 tiempos   | Sin límite de puntos, max 5 cambios                  |
| Basketball | 5         | 4 cuartos   | Sin límite de puntos, cambios ilimitados              |
| Tennis     | 1         | Sets (3)    | 6 games/set, sin cambios                             |

## Arquitectura

```
Client
  │
  ▼
┌─────────────────────┐
│   API Gateway :3000 │  JWT · Rate Limit · Correlation ID · Proxy
└──────────┬──────────┘
           │
    ┌──────┼────────────────────────────────┐
    ▼      ▼              ▼                 ▼              ▼
:3001    :3002          :3003             :3004           :3005
sports  tournaments    teams            matches         standings
           │
       phases (nested)
                        │
                    players (nested)
```

## Estructura del proyecto

```
backend/
├── services/
│   ├── gateway/       # API Gateway — auth, routing, rate limiting
│   ├── sports/        # Catálogo de deportes y reglas configurables
│   ├── tournaments/   # Torneos y fases
│   ├── teams/         # Equipos y jugadores
│   ├── matches/       # Partidos, marcadores, rotaciones, sustituciones
│   └── standings/     # Tabla de posiciones
├── shared/            # Tipos TypeScript y errores compartidos
├── db/
│   └── migrations/    # Migraciones SQL con node-pg-migrate
├── docker-compose.yml
├── .env.example
└── tsconfig.base.json
```

## Tech Stack

| Concern      | Tecnología                     |
|--------------|--------------------------------|
| Runtime      | Node.js 20+ LTS                |
| Lenguaje     | TypeScript 5.x strict          |
| Framework    | Express 5.x                    |
| Base de datos| PostgreSQL 15                  |
| DB Adapter   | pg (node-postgres)             |
| Validación   | Zod                            |
| Auth         | JWT (jsonwebtoken)             |
| Seguridad    | Helmet + CORS                  |
| Logging      | pino (structured JSON)         |
| Migraciones  | node-pg-migrate                |
| Contenedores | Docker + docker-compose        |

## Requisitos previos

- Node.js 20+
- npm 10+
- Docker Desktop

## Setup

### 1. Clonar e instalar dependencias

```bash
# Instalar todas las dependencias del monorepo
cd backend
npm install --workspace=shared
npm install --workspace=db
npm install --workspace=services/gateway
npm install --workspace=services/sports
npm install --workspace=services/tournaments
npm install --workspace=services/teams
npm install --workspace=services/matches
npm install --workspace=services/standings
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env si es necesario (el JWT_SECRET es obligatorio)
```

### 3. Levantar la base de datos

```bash
docker-compose up -d postgres
```

Opcionalmente también pgAdmin en http://localhost:5050 (admin@tournament.local / admin123):

```bash
docker-compose up -d
```

### 4. Ejecutar migraciones

```bash
cd db
DATABASE_URL=postgresql://tournament_user:change_me_in_production@localhost:5432/tournament_platform npx node-pg-migrate up --migrations-dir migrations
```

### 5. Compilar shared

```bash
cd shared && npm run build
```

### 6. Compilar y arrancar servicios

Cada servicio se puede iniciar independientemente:

```bash
# En terminales separadas
cd services/gateway     && npm run build && node dist/server.js
cd services/sports      && npm run build && node dist/server.js
cd services/tournaments && npm run build && node dist/server.js
cd services/teams       && npm run build && node dist/server.js
cd services/matches     && npm run build && node dist/server.js
cd services/standings   && npm run build && node dist/server.js
```

## API Reference

### Gateway (:3000)
Todos los endpoints bajo `/api/*` requieren `Authorization: Bearer <jwt>`.

| Prefijo             | Servicio destino |
|---------------------|-----------------|
| `GET /health`       | Gateway (público) |
| `/api/sports/*`     | sports :3001    |
| `/api/tournaments/*`| tournaments :3002|
| `/api/teams/*`      | teams :3003     |
| `/api/matches/*`    | matches :3004   |
| `/api/standings/*`  | standings :3005 |

---

### Sports (:3001)

| Método | Path          | Descripción              |
|--------|---------------|--------------------------|
| GET    | /sports       | Listar deportes          |
| GET    | /sports/:id   | Obtener deporte          |
| POST   | /sports       | Crear deporte (admin)    |
| PUT    | /sports/:id   | Actualizar deporte (admin)|
| DELETE | /sports/:id   | Eliminar deporte (admin) |

---

### Tournaments (:3002)

| Método | Path                              | Descripción          |
|--------|-----------------------------------|----------------------|
| GET    | /tournaments                      | Listar torneos       |
| POST   | /tournaments                      | Crear torneo         |
| GET    | /tournaments/:id                  | Obtener torneo       |
| PUT    | /tournaments/:id                  | Actualizar torneo    |
| DELETE | /tournaments/:id                  | Eliminar torneo      |
| GET    | /tournaments/:id/phases           | Listar fases         |
| POST   | /tournaments/:id/phases           | Agregar fase         |
| GET    | /tournaments/:id/phases/:phaseId  | Obtener fase         |
| PUT    | /tournaments/:id/phases/:phaseId  | Actualizar fase      |
| DELETE | /tournaments/:id/phases/:phaseId  | Eliminar fase        |

---

### Teams (:3003)

| Método | Path                            | Descripción                     |
|--------|---------------------------------|---------------------------------|
| GET    | /teams                          | Listar equipos                  |
| POST   | /teams                          | Crear equipo                    |
| GET    | /teams/:id                      | Obtener equipo                  |
| PUT    | /teams/:id                      | Actualizar equipo                |
| DELETE | /teams/:id                      | Eliminar equipo                  |
| GET    | /teams/:id/players              | Listar jugadores                 |
| POST   | /teams/:id/players              | Agregar jugador (valida plantel) |
| GET    | /teams/:id/players/:playerId    | Obtener jugador                  |
| PUT    | /teams/:id/players/:playerId    | Actualizar jugador               |
| DELETE | /teams/:id/players/:playerId    | Eliminar jugador                 |

---

### Matches (:3004)

| Método | Path                                    | Descripción                          |
|--------|-----------------------------------------|--------------------------------------|
| GET    | /matches                                | Listar partidos                       |
| POST   | /matches                                | Programar partido                     |
| GET    | /matches/:id                            | Obtener partido + períodos            |
| DELETE | /matches/:id                            | Eliminar partido (solo scheduled)     |
| PUT    | /matches/:id/start                      | Iniciar partido (crea períodos)       |
| PUT    | /matches/:id/finish                     | Finalizar partido (calcula ganador)   |
| PUT    | /matches/:id/periods/:n/score           | Actualizar marcador del período       |
| POST   | /matches/:id/lineups                    | Registrar alineación inicial (voleibol)|
| GET    | /matches/:id/lineups/:teamId/:set       | Ver rotación actual                   |
| POST   | /matches/:id/rotate                     | Aplicar rotación (voleibol)           |
| POST   | /matches/:id/substitutions             | Registrar cambio de jugador           |
| GET    | /matches/:id/substitutions             | Listar cambios del partido            |

---

### Standings (:3005)

| Método | Path                        | Descripción                           |
|--------|-----------------------------|---------------------------------------|
| GET    | /standings/:phaseId         | Tabla de posiciones ordenada          |
| POST   | /standings/recalculate      | Recalcular desde cero (interno)       |

---

## Flujo de un partido de voleibol

```
1. POST /tournaments              → crear torneo (sport: volleyball)
2. POST /tournaments/:id/phases   → agregar fase
3. POST /teams (×2)               → crear dos equipos
4. POST /teams/:id/players (×12)  → agregar 6+ jugadores por equipo
5. POST /matches                  → programar partido
6. PUT  /matches/:id/start        → iniciar (crea 5 sets)
7. POST /matches/:id/lineups      → registrar alineación equipo A (set 1)
8. POST /matches/:id/lineups      → registrar alineación equipo B (set 1)
9. PUT  /matches/:id/periods/1/score → actualizar marcador set 1
   → cuando homeScore >= 25 con margen >= 2: set finaliza automáticamente
   → set 2 se activa automáticamente
10. POST /matches/:id/rotate      → rotar equipo que ganó la recepción
11. POST /matches/:id/substitutions → realizar cambio (valida límite y rotación)
12. PUT  /matches/:id/finish      → finalizar partido
13. POST /standings/recalculate   → actualizar tabla de posiciones
```

## Reglas de validación implementadas

### Volleyball
- Exactamente 6 jugadores en la alineación (posiciones 1-6, sin duplicados)
- Al rotar: cada jugador avanza una posición en sentido horario
- Cambio respeta la rotación: el entrante ocupa el slot del saliente
- Máximo 6 cambios por set por equipo
- Sets 1-4: primero en llegar a 25 con margen de 2
- Set 5: primero en llegar a 15 con margen de 2
- Marcador 26-25 es inválido (margen insuficiente)

### Football
- 2 tiempos, sin límite de puntos
- Máximo 5 sustituciones por partido
- Permite empate

### Basketball
- 4 cuartos, sin límite de puntos
- Sustituciones ilimitadas

### Tennis
- Sets: primero en llegar a 6 games con margen de 2 (o tiebreak)
- Sin sustituciones

## Seguridad

- JWT requerido en todos los endpoints (validado en el gateway)
- Helmet + CORS en todos los servicios
- Solo queries parametrizadas (sin concatenación SQL)
- Correlation IDs en cada request para trazabilidad
- Rate limiting: 200 req/15min por IP en el gateway
- Stack traces nunca expuestos al cliente
- Secretos cargados desde variables de entorno (nunca hardcoded)

## Autores

- Wilson Velandia
