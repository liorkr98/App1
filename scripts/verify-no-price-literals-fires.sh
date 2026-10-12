#!/usr/bin/env bash
#
# Proves verify-no-price-literals.mjs fires: plants a price in a component
# and in a locale string, in a COPY of the sources, and asserts both are
# refused. A rule that silently stops matching is worse than none (§4.1).
set -uo pipefail

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if ! node scripts/verify-no-price-literals.mjs . >/dev/null 2>&1; then
  echo "FAIL: the price check rejects the real tree, so the proof below proves nothing."
  exit 1
fi

mkdir -p "$WORK/src/features/billing" "$WORK/web/src/components" "$WORK/locales"
cp src/features/billing/pricing-config.ts "$WORK/src/features/billing/"
echo '{"ok":"שלום"}' > "$WORK/locales/he.json"
printf '<p>רק ₪29 לחודש</p>\n' > "$WORK/web/src/components/Probe.astro"
if node scripts/verify-no-price-literals.mjs "$WORK" >/dev/null 2>&1; then
  echo "FAIL: a price typed into a component passed the check."
  exit 1
fi

rm "$WORK/web/src/components/Probe.astro"
echo '{"pricing":{"headline":"דף ב-₪19 בלבד"}}' > "$WORK/locales/he.json"
if node scripts/verify-no-price-literals.mjs "$WORK" >/dev/null 2>&1; then
  echo "FAIL: a price typed into a locale string passed the check."
  exit 1
fi

echo '{"ok":"שלום"}' > "$WORK/locales/he.json"
printf 'const plan = { amountAgorot: 2900 };\n' > "$WORK/web/src/components/probe.ts"
if node scripts/verify-no-price-literals.mjs "$WORK" >/dev/null 2>&1; then
  echo "FAIL: an agorot amount outside the price list passed the check."
  exit 1
fi
echo "OK: the price check fires on a component, a locale string and an agorot amount."
