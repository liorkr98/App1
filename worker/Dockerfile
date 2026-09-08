# One image, two process groups (ADR 0001).
#
# The pdf group needs Chrome; the worker group does not. They still share an
# image because maintaining two Dockerfiles that must stay in step is worse
# than carrying ~150MB the worker group does not use — and Fly caches layers,
# so it is paid once.

FROM node:22-slim AS base

# sharp ships prebuilt libvips for linux-x64, so no build toolchain is needed.
# ffmpeg is here for D-b's frame extraction.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
FROM base AS deps

COPY worker/package.json worker/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM base AS build

COPY worker/package.json worker/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY worker/tsconfig.json ./
COPY worker/src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM base AS runtime

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY worker/package.json ./

# Never run as root. A pipeline that opens files uploaded by strangers is
# exactly the process you do not want holding root.
USER node

CMD ["node", "dist/index.js"]
