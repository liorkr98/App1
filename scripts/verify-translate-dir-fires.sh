#!/usr/bin/env bash
#
# Proves the translateX/--dir rule actually fires.

set -uo pipefail

PROBE="web/src/components/__translate_probe.css"
LOG="$(mktemp)"

cleanup() {
  rm -f "$PROBE" "$LOG"
}
trap cleanup EXIT

cat > "$PROBE" <<'PROBE_EOF'
.probe { transform: translateX(24px); }
PROBE_EOF

if node scripts/verify-translate-dir.mjs > "$LOG" 2>&1; then
  echo "FAIL: the scan accepted translateX without --dir."
  cat "$LOG"
  exit 1
fi

if ! grep -q '__translate_probe' "$LOG"; then
  echo "FAIL: the scan failed, but not because of the probe file."
  cat "$LOG"
  exit 1
fi

echo "OK: the translateX/--dir rule fired on the probe."
cat "$LOG"
