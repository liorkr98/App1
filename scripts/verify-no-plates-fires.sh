#!/usr/bin/env bash
#
# Proves the plate scan actually fires.
#
# A rule that silently stops matching looks like coverage while catching
# nothing. This plants a dashed Israeli plate in a COPY of the build, asserts
# the scan rejects it, and leaves the real dist untouched.

set -uo pipefail

DIST="${1:-web/dist/client}"
WORK="$(mktemp -d)"
LOG="$(mktemp)"

cleanup() {
  rm -rf "$WORK" "$LOG"
}
trap cleanup EXIT

if [ ! -d "$DIST" ]; then
  echo "FAIL: no build output at $DIST. Run the web build first."
  exit 1
fi

mkdir -p "$WORK/template-check/__plate_probe"
cat > "$WORK/template-check/__plate_probe/index.html" <<'PROBE_EOF'
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><title>probe</title></head>
<body>
<p>הרכב 12-345-67 למכירה בתל אביב.</p>
</body>
</html>
PROBE_EOF

if node scripts/verify-no-plates.mjs "$WORK" > "$LOG" 2>&1; then
  echo "FAIL: the scan accepted a dashed licence plate on a listing page."
  echo "      The rule is not matching. Check scripts/verify-no-plates.mjs."
  cat "$LOG"
  exit 1
fi

if ! grep -q '__plate_probe' "$LOG"; then
  echo "FAIL: the scan failed, but not because of the probe page."
  cat "$LOG"
  exit 1
fi

echo "OK: the plate rule fired on the probe. Reported:"
grep '__plate_probe' "$LOG"
