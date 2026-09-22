#!/usr/bin/env bash
#
# Proves the Google Fonts scan actually fires.
#
# A rule that silently stops matching looks like coverage while catching
# nothing. This plants a fonts.googleapis.com link in a COPY of the build,
# asserts the scan rejects it, and leaves the real dist untouched.

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

mkdir -p "$WORK/template-check/__fonts_probe"
cat > "$WORK/template-check/__fonts_probe/index.html" <<'PROBE_EOF'
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<title>probe</title>
<link href="https://fonts.googleapis.com/css2?family=Assistant&display=swap" rel="stylesheet">
</head>
<body></body>
</html>
PROBE_EOF

if node scripts/verify-no-google-fonts.mjs "$WORK" > "$LOG" 2>&1; then
  echo "FAIL: the scan accepted a Google Fonts link on a listing page."
  echo "      The rule is not matching. Check scripts/verify-no-google-fonts.mjs."
  cat "$LOG"
  exit 1
fi

if ! grep -q '__fonts_probe' "$LOG"; then
  echo "FAIL: the scan failed, but not because of the probe page."
  cat "$LOG"
  exit 1
fi

echo "OK: the Google Fonts rule fired on the probe. Reported:"
grep '__fonts_probe' "$LOG"
