# ── Stage 1: Install dependencies ────────────────────────────────
FROM oven/bun:1.2-alpine AS deps

WORKDIR /app

# WHY: bun.lock is git-ignored, so we only copy package.json for caching
COPY package.json bunfig.toml ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# ── Stage 2: Build ───────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bunfig.toml tsconfig.json ./
COPY src/ ./src/
COPY templates/ ./templates/

RUN bun build src/index.ts --outdir ./dist --target bun

# ── Stage 3: Production runtime ──────────────────────────────────
FROM oven/bun:1.2-alpine AS runtime

WORKDIR /app

# WHY: LanceDB native binaries need gcompat on Alpine
RUN apk add --no-cache git gcompat

COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json templates/ ./

# WHY: LanceDB data directory — mount a volume here for persistence
RUN mkdir -p /app/data

# Default: headless mode enabled in container
ENV ADEV_HEADLESS=1
ENV ADEV_DATA_DIR=/app/data
ENV NODE_ENV=production

ENTRYPOINT ["bun", "run", "dist/index.js"]
CMD ["--help"]
