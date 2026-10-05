#!/usr/bin/env bash
# Proves verify-editor-motion.mjs still fires. A rule that silently stops
# matching is worse than no rule (CLAUDE.md §4.1).
#
# Copies the editor components and editor.css to a temp dir, checks they pass
# as-is, then plants a button whose class has no :hover or :active rule, and
# separately a button with no class at all, and expects each to fail.
set -euo pipefail

DIR="${1:-web/src/components/editor}"
CSS="${2:-web/src/styles/editor.css}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/editor"
cp "$DIR"/*.tsx "$TMP/editor/"
cp "$CSS" "$TMP/editor.css"

if ! node scripts/verify-editor-motion.mjs "$TMP/editor" "$TMP/editor.css" >/dev/null 2>&1; then
  echo "FAIL: the unmodified editor does not pass, so the probe proves nothing."
  exit 1
fi

cat > "$TMP/editor/Probe.tsx" <<'TSX'
export function Probe() {
  return (
    <button type="button" className="probe-without-state" onClick={() => undefined}>
      x
    </button>
  );
}
TSX
if node scripts/verify-editor-motion.mjs "$TMP/editor" "$TMP/editor.css" >/dev/null 2>&1; then
  echo "FAIL: a button with no :hover/:active rule was planted and the check did not fire."
  exit 1
fi

cat > "$TMP/editor/Probe.tsx" <<'TSX'
export function Probe() {
  return <button type="button" onClick={() => undefined}>x</button>;
}
TSX
if node scripts/verify-editor-motion.mjs "$TMP/editor" "$TMP/editor.css" >/dev/null 2>&1; then
  echo "FAIL: a button with no class was planted and the check did not fire."
  exit 1
fi

echo "OK: the editor motion check fired on a stateless button and on a classless one."
