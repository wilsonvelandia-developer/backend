# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Builder
# Compiles TypeScript and installs only production dependencies.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies (needed for bcrypt native module)
RUN apk add --no-cache python3 make g++

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY services/gateway/package.json ./services/gateway/
COPY services/sports/package.json ./services/sports/
COPY services/tournaments/package.json ./services/tournaments/
COPY services/teams/package.json ./services/teams/
COPY services/matches/package.json ./services/matches/
COPY services/standings/package.json ./services/standings/
COPY services/venues/package.json ./services/venues/
COPY services/announcements/package.json ./services/announcements/
COPY services/payments/package.json ./services/payments/
COPY services/gallery/package.json ./services/gallery/

# Install all dependencies (including devDeps needed for the TS build)
RUN npm ci --workspace=shared \
           --workspace=services/gateway \
           --workspace=services/sports \
           --workspace=services/tournaments \
           --workspace=services/teams \
           --workspace=services/matches \
           --workspace=services/standings \
           --workspace=services/venues \
           --workspace=services/announcements \
           --workspace=services/payments \
           --workspace=services/gallery

# Copy all source code
COPY . .

# Compile the unified server
RUN npm run build:unified

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Production runner
# Minimal alpine image, no build tools, non-root user.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install only the runtime native dependency (bcrypt)
RUN apk add --no-cache python3 make g++ \
    && npm install -g npm@10 \
    && apk del make g++ python3

# Create non-root user for security
RUN addgroup -S olimpic && adduser -S -G olimpic olimpic

# Copy workspace manifests and install production-only deps
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY services/gateway/package.json ./services/gateway/
COPY services/sports/package.json ./services/sports/
COPY services/tournaments/package.json ./services/tournaments/
COPY services/teams/package.json ./services/teams/
COPY services/matches/package.json ./services/matches/
COPY services/standings/package.json ./services/standings/
COPY services/venues/package.json ./services/venues/
COPY services/announcements/package.json ./services/announcements/
COPY services/payments/package.json ./services/payments/
COPY services/gallery/package.json ./services/gallery/

RUN npm ci --omit=dev \
           --workspace=shared \
           --workspace=services/gateway \
           --workspace=services/sports \
           --workspace=services/tournaments \
           --workspace=services/teams \
           --workspace=services/matches \
           --workspace=services/standings \
           --workspace=services/venues \
           --workspace=services/announcements \
           --workspace=services/payments \
           --workspace=services/gallery

# Copy compiled output from builder
COPY --from=builder /app/dist-unified ./dist-unified

# Set ownership
RUN chown -R olimpic:olimpic /app

USER olimpic

# Runtime env defaults (override via docker run -e or docker-compose)
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info

EXPOSE 3000

# Health check — polls the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist-unified/server-unified.js"]
