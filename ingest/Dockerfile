# Scheduled ingestion jobs (CLAUDE.md §3).
#
# Separate from worker/ on purpose: a schools sync that streams for twenty
# minutes must not share a queue with a seller waiting for their photos.

FROM node:22-slim AS base

# Two system binaries, both chosen over an npm dependency (CLAUDE.md §2):
#
#   unzip        streams one member at a time out of the GTFS archive, which
#                is a few hundred megabytes (src/gtfs/zip.ts).
#   osmium-tool  filters and exports the OSM extract. A .osm.pbf is protobuf,
#                and every Node parser for it is heavier and less maintained
#                than the standard OSM command-line tool (src/osm/extract.ts).
RUN apt-get update && apt-get install -y --no-install-recommends \
      unzip \
      osmium-tool \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps
COPY ingest/package.json ingest/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM base AS build
COPY ingest/package.json ingest/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY ingest/tsconfig.json ingest/tsconfig.build.json ./
COPY ingest/src ./src
# The shared domain types. ingest/tsconfig.json sets rootDir to the repo root
# so the payload shape written here is the same one web/ renders.
COPY src ../src
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY ingest/package.json ./

# Never root. This process opens archives fetched from the public internet.
USER node

# No default command: each source is scheduled separately, and a container
# that syncs everything on boot is how a feed outage takes out all three.
