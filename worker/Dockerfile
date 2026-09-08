# One image, two process groups (ADR 0001).
#
# The pdf group needs Chrome; the worker group does not. They still share an
# image because maintaining two Dockerfiles that must stay in step is worse
# than carrying the extra weight the worker group does not use — and Fly caches
# layers, so it is paid once.

FROM node:22-slim AS base

# sharp ships prebuilt libvips for linux-x64, so no build toolchain is needed.
# ffmpeg is D3's frame extraction.
#
# The font packages are NOT decoration. Chrome prints Hebrew as empty boxes
# when it cannot find a face that covers the block, and it does so silently —
# no error, a valid PDF, and nobody notices until a buyer opens it. The page
# asks Google Fonts for Frank Ruhl Libre and Assistant; fonts-noto-core carries
# Noto Sans Hebrew as the floor under that, for the render that happens while
# the CDN is having a bad minute. src/pdf/verify.ts is the check that this
# actually worked.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      fonts-liberation \
      fonts-noto-core \
      fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Puppeteer downloads Chrome at install time. The default cache is under the
# installing user's home, which is root's — and the runtime stage runs as
# `node`, which cannot read it. Pinning the location to somewhere both stages
# agree on is the whole fix; without it the pdf group fails to launch with an
# error about a missing browser that looks nothing like a permissions problem.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

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

# Nothing here needs a browser — this stage only runs tsc.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY worker/package.json worker/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY worker/tsconfig.json worker/tsconfig.build.json ./
COPY worker/src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM base AS runtime

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.cache ./.cache
COPY --from=build /app/dist ./dist
COPY worker/package.json ./

# Chrome writes profile and crash data next to itself, and the pdf group runs
# for hours. Ownership has to follow the user or the first render fails.
RUN chown -R node:node /app/.cache

# Never run as root. A pipeline that opens files uploaded by strangers is
# exactly the process you do not want holding root.
USER node

CMD ["node", "dist/index.js"]
