#!/usr/bin/env bash
#
# Proves verify-public-links.mjs fires, on a COPY of the build:
#   1. the homepage linking into /template-check/ (the bug of 13 Oct 2026)
#      is refused, although the file is on disk;
#   2. a link to a page that was never built is refused.

set -uo pipefail

DIST="${1:-web/dist/client}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ ! -f "$DIST/index.html" ]; then
  echo "FAIL: no build at $DIST. Run the web build first."
  exit 1
fi

if ! node scripts/verify-public-links.mjs "$DIST" >/dev/null 2>&1; then
  echo "FAIL: the link check rejects the real build, so the proofs below prove nothing."
  exit 1
fi

if [ ! -d "$DIST/template-check" ]; then
  echo "FAIL: no /template-check/ in the build to link into."
  exit 1
fi
first="$(ls "$DIST/template-check" | head -1)"

cp -r "$DIST/." "$WORK/"
sed -i "s#</body>#<a href=\"/template-check/${first}/\">probe</a></body>#" "$WORK/index.html"
if node scripts/verify-public-links.mjs "$WORK" >/dev/null 2>&1; then
  echo "FAIL: the link check passed a homepage link into /template-check/."
  exit 1
fi

rm -rf "$WORK"/* "$WORK"/.[!.]* && cp -r "$DIST/." "$WORK/"
sed -i 's#</body>#<a href="/templates/no-such-design/demo/">probe</a></body>#' "$WORK/index.html"
if node scripts/verify-public-links.mjs "$WORK" >/dev/null 2>&1; then
  echo "FAIL: the link check passed a link to a page that was never built."
  exit 1
fi
echo "OK: the link check fires on an undeployed target and on a missing page."
