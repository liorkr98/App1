#!/usr/bin/env bash
#
# Proves verify-structured-data.mjs fires, on a COPY of the build:
#   1. a GeoCoordinates node planted in a listing fixture is refused;
#   2. an indexable page with the Organization stripped is refused.

set -uo pipefail

DIST="${1:-web/dist/client}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ ! -f "$DIST/index.html" ]; then
  echo "FAIL: no build at $DIST. Run the web build first."
  exit 1
fi

if ! node scripts/verify-structured-data.mjs "$DIST" >/dev/null 2>&1; then
  echo "FAIL: the structured-data check rejects the real build, so the proofs below prove nothing."
  exit 1
fi

cp -r "$DIST/." "$WORK/"
mkdir -p "$WORK/__ld_probe"
cat > "$WORK/__ld_probe/index.html" <<'PROBE'
<!DOCTYPE html><html lang="he"><head><meta name="robots" content="noindex">
<script type="application/ld+json">{"@type":"RealEstateListing","geo":{"@type":"GeoCoordinates","latitude":32.08,"longitude":34.78}}</script>
</head><body></body></html>
PROBE
if node scripts/verify-structured-data.mjs "$WORK" >/dev/null 2>&1; then
  echo "FAIL: the structured-data check passed a listing with coordinates."
  exit 1
fi

rm -rf "$WORK"/* && cp -r "$DIST/." "$WORK/"
sed -i 's/"@type":"Organization"/"@type":"Thing"/g' "$WORK/pricing/index.html"
if node scripts/verify-structured-data.mjs "$WORK" >/dev/null 2>&1; then
  echo "FAIL: the structured-data check passed an indexable page with no Organization."
  exit 1
fi
echo "OK: the structured-data check fires on coordinates and on a missing Organization."
