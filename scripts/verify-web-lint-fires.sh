#!/usr/bin/env bash
#
# Proves the web logical-property rule actually fires.
#
# Same reasoning as scripts/verify-rtl-lint.sh for the mobile app: a rule that
# silently stops matching looks like coverage while catching nothing. This
# plants a file with physical left/right declarations, asserts the scan
# rejects it, and deletes it again.
#
# Satisfies the Stage B1 acceptance item "lint fails on a deliberately added
# margin-left in web/ — demonstrate it", on every push rather than once.

set -uo pipefail

PROBE="web/src/components/__physical_probe.astro"
LOG="$(mktemp)"

cleanup() {
  rm -f "$PROBE" "$LOG"
}
trap cleanup EXIT

cat > "$PROBE" <<'PROBE_EOF'
<div class="probe"></div>
<style>
/* Every declaration below is a deliberate violation. */
.probe{ margin-left: 8px; padding-right: 4px; text-align: left; }
.probe-2{ border-left: 1px solid red; float: right; }
PROBE_EOF
printf '</style>\n' >> "$PROBE"

if node scripts/verify-web-logical-props.mjs > "$LOG" 2>&1; then
  echo "FAIL: the scan accepted a file full of physical left/right properties."
  echo "      The rule is not matching. Check scripts/verify-web-logical-props.mjs."
  cat "$LOG"
  exit 1
fi

if ! grep -q '__physical_probe' "$LOG"; then
  echo "FAIL: the scan failed, but not because of the probe file."
  cat "$LOG"
  exit 1
fi

echo "OK: the web logical-property rule fired on the probe. Reported:"
cat "$LOG"
