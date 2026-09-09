#!/usr/bin/env bash
#
# Proves the <bdi> scan actually fires.
#
# Same reasoning as scripts/verify-web-lint-fires.sh: a rule that silently
# stops matching looks like coverage while catching nothing, and this one is
# more prone to it than most. The scan works by subtraction — it strips <head>,
# <script>, <style> and every <bdi> block, then looks at what is left. One
# over-broad pattern in that stripping step and the whole page becomes exempt,
# with the scan still reporting OK.
#
# So this plants a bare Hebrew number in a COPY of the build, asserts the scan
# rejects it, and leaves the real dist untouched.

set -uo pipefail

DIST="${1:-web/dist}"
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

cp -r "$DIST/." "$WORK/"

# The probe. A price in Hebrew prose, outside any <bdi> — the exact shape of
# the bug: it would read correctly on the page today.
PROBE_PAGE="$WORK/__bdi_probe/index.html"
mkdir -p "$(dirname "$PROBE_PAGE")"
cat > "$PROBE_PAGE" <<'PROBE_EOF'
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><title>probe</title></head>
<body>
<p>הדירה נמכרה תמורת 1,850,000 שקלים.</p>
</body>
</html>
PROBE_EOF

if node scripts/verify-bdi.mjs "$WORK" > "$LOG" 2>&1; then
  echo "FAIL: the scan accepted a bare number in Hebrew prose."
  echo "      The rule is not matching. Check scripts/verify-bdi.mjs —"
  echo "      most likely the NOT_PROSE pattern is stripping too much."
  cat "$LOG"
  exit 1
fi

if ! grep -q '__bdi_probe' "$LOG"; then
  echo "FAIL: the scan failed, but not because of the probe page."
  cat "$LOG"
  exit 1
fi

echo "OK: the <bdi> rule fired on the probe. Reported:"
grep '__bdi_probe' "$LOG"
