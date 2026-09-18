# =============================================================================
# DeterminEat — production image
#
# Multi-stage build:
#   1. frontend-build : build the React SPA with Vite
#   2. backend-build  : compile the Express/TypeScript backend + Prisma client
#   3. runtime        : slim image running Express, which also serves the SPA
#
# Build context is the repo root (both frontend/ and backend/ are needed).
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — build the React frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./
# Produces frontend/dist (static SPA assets)
RUN npm run build


# -----------------------------------------------------------------------------
# Stage 2 — build the backend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS backend-build
RUN apk add --no-cache openssl
WORKDIR /app

# Shared TS base config that backend/tsconfig.json extends via ../tsconfig.base.json
COPY tsconfig.base.json ./

WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install

COPY backend/ ./
# Generate the Prisma client, then compile TypeScript → dist/
RUN npx prisma generate
RUN npm run build


# -----------------------------------------------------------------------------
# Stage 3 — runtime
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Express serves the SPA from this directory (see backend/src/app.ts)
ENV PUBLIC_DIR=/app/public

# Install production dependencies only. `prisma` (the CLI, used for migrate
# deploy at startup) is a devDependency, so install it explicitly here without
# pulling in the rest of the dev toolchain.
COPY backend/package.json ./
RUN npm install --omit=dev && npm install prisma@5.19.1 --no-save

# Prisma schema (needed for `migrate deploy`) and the generated client copied
# from the build stage (avoids regenerating and keeps engine versions aligned)
COPY backend/prisma ./prisma
COPY --from=backend-build /app/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend-build /app/backend/node_modules/@prisma/client ./node_modules/@prisma/client

# Compiled backend
COPY --from=backend-build /app/backend/dist ./dist

# Built React SPA → served as static files by Express
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 3000

# Apply pending migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
