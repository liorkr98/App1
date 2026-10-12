#!/usr/bin/env bash
#
# Proves verify-security-headers.mjs fires: strips HSTS from a COPY of the
# built _headers and asserts the check rejects it. Same reasoning as
# verify-web-lint-fires.sh — a gate that stops matching reads as coverage.

set -uo pipefail

DIST="${1:-web/dist/client}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ ! -f "$DIST/_headers" ]; then
  echo "FAIL: no $DIST/_headers. Run the web build first."
  exit 1
fi

cp "$DIST/_headers" "$WORK/_headers"
grep -v 'Strict-Transport-Security' "$DIST/_headers" > "$WORK/_headers"

if node scripts/verify-security-headers.mjs "$WORK" >/dev/null 2>&1; then
  echo "FAIL: the security-headers check passed a build with no HSTS."
  exit 1
fi

if ! node scripts/verify-security-headers.mjs "$(dirname "$DIST")" >/dev/null 2>&1; then
  echo "FAIL: the security-headers check rejects the real build too, so the proof above proves nothing."
  exit 1
fi
echo "OK: the security-headers check fires when a header goes missing."
