#!/usr/bin/env bash
#
# Proves the CLAUDE.md §4 lint rules actually fire.
#
# A lint rule that silently stops matching is worse than no rule at all: it
# looks like coverage while catching nothing. This writes a file that violates
# §4.1 and §4.2 on purpose, asserts ESLint rejects it for exactly those
# reasons, and deletes it again.
#
# Replaces the manual "write marginLeft: 8 somewhere and confirm lint fails"
# check, so it runs on every push instead of when someone remembers.

set -uo pipefail

PROBE="src/features/__rtl_lint_probe.tsx"
LOG="$(mktemp)"

cleanup() {
  rm -f "$PROBE" "$LOG"
}
trap cleanup EXIT

cat > "$PROBE" <<'PROBE_EOF'
import { I18nManager, View } from 'react-native';

// Every line in here is a deliberate CLAUDE.md §4 violation.
export function RtlLintProbe() {
  const banned = { marginLeft: 8, paddingRight: 4, textAlign: 'left' as const };
  const doubleFlip = I18nManager.isRTL ? 'row-reverse' : 'row';

  return <View style={[banned, { flexDirection: doubleFlip }]} />;
}
PROBE_EOF

if npx eslint "$PROBE" > "$LOG" 2>&1; then
  echo "FAIL: ESLint accepted a file that violates CLAUDE.md §4.1 and §4.2."
  echo "      The RTL rules are not matching. Check eslint.config.js."
  exit 1
fi

failed=0

if ! grep -q 'CLAUDE.md §4.1' "$LOG"; then
  echo "FAIL: the §4.1 rule (directional style properties) did not fire."
  failed=1
fi

if ! grep -q 'CLAUDE.md §4.2' "$LOG"; then
  echo "FAIL: the §4.2 rule (row-reverse double-flip) did not fire."
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  echo "--- eslint output ---"
  cat "$LOG"
  exit 1
fi

echo "OK: RTL lint rules fired on the probe. Violations reported:"
cat "$LOG"
