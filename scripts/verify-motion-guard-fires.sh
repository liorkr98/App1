#!/usr/bin/env bash
# Proves verify-motion-guard.mjs still fires. A rule that silently stops
# matching is worse than no rule (CLAUDE.md §4.1).
#
# Copies the built listing page and its stylesheets to a temp dist, checks it
# passes as-is, then plants an unguarded animation and expects a failure.
set -euo pipefail

DIST="${1:-web/dist/client}"
PAGE="$DIST/template-check/A7K2M/index.html"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/template-check/A7K2M"
cp "$PAGE" "$TMP/template-check/A7K2M/index.html"
grep -o 'href="/[^"]*\.css"' "$PAGE" | sed 's/href="\///; s/"$//' | while read -r css; do
  mkdir -p "$TMP/$(dirname "$css")"
  cp "$DIST/$css" "$TMP/$css"
done

if ! node scripts/verify-motion-guard.mjs "$TMP" >/dev/null 2>&1; then
  echo "FAIL: the unmodified build does not pass, so the probe proves nothing."
  exit 1
fi

FIRST_CSS="$(grep -o 'href="/[^"]*\.css"' "$PAGE" | head -1 | sed 's/href="\///; s/"$//')"
printf '\n.probe-unguarded{animation:ls-breathe 26s ease-in-out infinite}\n' >> "$TMP/$FIRST_CSS"

if node scripts/verify-motion-guard.mjs "$TMP" >/dev/null 2>&1; then
  echo "FAIL: an unguarded animation was planted and the guard did not fire."
  exit 1
fi

echo "OK: the motion guard fired on an unguarded animation."
