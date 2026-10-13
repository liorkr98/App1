#!/usr/bin/env bash
#
# Proves verify-client-copy.mjs fires, on a COPY of the build: a client
# script that asks for guides.title (copy the client build removes) is
# refused.

set -uo pipefail

DIST="${1:-web/dist/client}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ ! -d "$DIST/_astro" ]; then
  echo "FAIL: no build at $DIST. Run the web build first."
  exit 1
fi

if ! node scripts/verify-client-copy.mjs "$DIST" >/dev/null 2>&1; then
  echo "FAIL: the client-copy check rejects the real build, so the proof below proves nothing."
  exit 1
fi

cp -r "$DIST/." "$WORK/"
echo 'export const probe = (t) => t("guides.title");' > "$WORK/_astro/__copy_probe.js"
if node scripts/verify-client-copy.mjs "$WORK" >/dev/null 2>&1; then
  echo "FAIL: the client-copy check passed a script that reads guides.title."
  exit 1
fi
echo "OK: the client-copy check fires on a client script that reads removed copy."
