# OSRM, foot profile, for Israel.
#
# ========================== WHY THIS EXISTS ==========================
# CLAUDE.md §2 chose OSRM, self-hosted, and docs/INGEST.md recorded for weeks
# that it was "not running". That was never a missing line of code: OSRM is a
# service that answers from a routing graph held in memory, and the graph has
# to be built from an OSM extract first. Nothing in a Cloudflare Worker can
# host one, so until this image exists there is nowhere for it to run.
#
# ======================= THE GRAPH IS BAKED IN =======================
# The extract and the three build steps run at IMAGE BUILD time, and only the
# finished graph ships in the final stage. The alternative — build on first
# boot into a volume — means a machine that starts slowly, fails in a way the
# deploy does not see, and needs a volume to be correct. A graph is immutable
# data; an image is the right place for it.
#
# The cost is a large image and a slow build, both paid once per data refresh.
# Rebuild when the OSM extract is stale enough to matter, which for walking
# routes is months rather than days.
#
# ===================== FOOT, AND ONLY FOOT =====================
# `foot.lua`, because the product's only routing question is how long a walk
# takes. The demo server at router.project-osrm.org answers /foot/ URLs with
# CAR times — 162 seconds where a pedestrian router says 277 — which is
# exactly the flattering lie CLAUDE.md §2 forbids. A profile is not a URL
# segment; it is what the graph was built with.

ARG OSRM_VERSION=v6.0.0

# ---------------------------------------------------------------------------
# Build the graph
# ---------------------------------------------------------------------------
FROM ghcr.io/project-osrm/osrm-backend:${OSRM_VERSION} AS graph

# Israel and the Palestinian territories, from Geofabrik. The same extract
# ingest/src/osm/extract.ts downloads for places, so one source serves both.
ARG EXTRACT_URL=https://download.geofabrik.de/asia/israel-and-palestine-latest.osm.pbf

WORKDIR /data

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o region.osm.pbf "${EXTRACT_URL}"

# MLD, not CH. `osrm-routed --algorithm mld` answers /table for a hundred
# destinations at once, which is the call this product makes — one matrix per
# listing at publish, never one route per place.
RUN osrm-extract -p /opt/foot.lua region.osm.pbf \
    && osrm-partition region.osrm \
    && osrm-customize region.osrm \
    && rm -f region.osm.pbf

# ---------------------------------------------------------------------------
# Serve it
# ---------------------------------------------------------------------------
FROM ghcr.io/project-osrm/osrm-backend:${OSRM_VERSION} AS runtime

WORKDIR /data
COPY --from=graph /data/region.osrm* /data/

EXPOSE 5000

# --max-table-size is the matrix limit. The product asks for at most 36
# destinations (MAX_ROUTED_DESTINATIONS in src/features/listings/walk.ts);
# 100 leaves room without inviting an expensive request.
CMD ["osrm-routed", "--algorithm", "mld", "--max-table-size", "100", "/data/region.osrm"]
