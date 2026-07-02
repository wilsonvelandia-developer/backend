FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY services/gateway/package.json services/gateway/
RUN npm ci --workspace=shared --workspace=services/gateway
COPY shared/ shared/
COPY services/gateway/ services/gateway/
COPY tsconfig.base.json ./
RUN npm run build --workspace=shared && npm run build --workspace=services/gateway

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/gateway/dist ./dist
COPY --from=builder /app/services/gateway/package.json ./
COPY --from=builder /app/shared/dist ./node_modules/@tournament/shared/dist
COPY --from=builder /app/shared/package.json ./node_modules/@tournament/shared/
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
