#!/usr/bin/env bash
#
# Proves the absent-contrast gate actually fires — both of its checks.
#
# A rule that silently stops matching looks like coverage while catching
# nothing. This builds a COPY of just the page and stylesheets the gate reads,
# plants a violation in it, asserts the gate rejects it, and leaves the real
# dist untouched.
#
# Two probes, because the gate makes two different claims:
#   A. a template that repaints the absent cell away from --absent is caught
#      (this is the one that found studio at 4.09:1)
#   B. an --absent value that fails the ratio is caught

set -uo pipefail

DIST="${1:-web/dist/client}"
WORK="$(mktemp -d)"
LOG="$(mktemp)"

cleanup() {
  rm -rf "$WORK" "$LOG"
}
trap cleanup EXIT

PAGE="$DIST/template-check/A7K2M/index.html"

if [ ! -f "$PAGE" ]; then
  echo "FAIL: no built listing page at $PAGE. Run the web build first."
  exit 1
fi

# Copy the page, then every local stylesheet it links, at the same paths.
mkdir -p "$WORK/template-check/A7K2M"
cp "$PAGE" "$WORK/template-check/A7K2M/index.html"

SHEETS="$(grep -o 'href="/[^"]*\.css"' "$PAGE" | sed 's/href="//; s/"//')"
if [ -z "$SHEETS" ]; then
  echo "FAIL: the built page links no local stylesheet. The gate would read nothing."
  exit 1
fi

TARGET=""
for href in $SHEETS; do
  src="$DIST$href"
  [ -f "$src" ] || continue
  mkdir -p "$WORK$(dirname "$href")"
  cp "$src" "$WORK$href"
  # Plant into whichever sheet actually carries the absent cell.
  if grep -q '\.fact\.off' "$src"; then
    TARGET="$WORK$href"
  fi
done

if [ -z "$TARGET" ]; then
  echo "FAIL: no copied stylesheet contains .fact.off. The gate has nothing to check."
  exit 1
fi

# Sanity: the untouched copy must PASS, or the probes below prove nothing.
if ! node scripts/verify-absent-contrast.mjs "$WORK" > "$LOG" 2>&1; then
  echo "FAIL: the unmodified copy already fails, so a probe failure would mean nothing."
  cat "$LOG"
  exit 1
fi

# --- Probe A: repaint the absent label away from --absent -------------------
cp "$TARGET" "$TARGET.orig"
printf '\nhtml[data-template=editorial] .fact.off .fact-lbl{color:var(--muted)}\n' >> "$TARGET"

if node scripts/verify-absent-contrast.mjs "$WORK" > "$LOG" 2>&1; then
  echo "FAIL: the gate accepted a template repainting the absent label off --absent."
  echo "      Check 2 is not matching. See scripts/verify-absent-contrast.mjs."
  cat "$LOG"
  exit 1
fi

if ! grep -q 'bypasses --absent' "$LOG"; then
  echo "FAIL: the gate failed, but not because of probe A."
  cat "$LOG"
  exit 1
fi

echo "OK: probe A fired — $(grep -c 'bypasses --absent' "$LOG") override rejected."
mv "$TARGET.orig" "$TARGET"

# --- Probe B: an --absent that cannot be read -------------------------------
#
# Scoped to one template rather than rewriting the base token: the base lives
# in whichever sheet carries the shared tokens, which is not necessarily the
# one carrying .fact.off, and an earlier version of this probe silently
# rewrote only the dark override — landing on a value that PASSED on that
# template's near-black ground, so the probe proved nothing.
printf '\nhtml[data-template=editorial]{--absent:#e8e4da}\n' >> "$TARGET"

if node scripts/verify-absent-contrast.mjs "$WORK" > "$LOG" 2>&1; then
  echo "FAIL: the gate accepted an --absent value that cannot be read."
  echo "      Check 1 is not matching. See scripts/verify-absent-contrast.mjs."
  cat "$LOG"
  exit 1
fi

if ! grep -q 'under the 4.5 bar' "$LOG"; then
  echo "FAIL: the gate failed, but not because of probe B."
  cat "$LOG"
  exit 1
fi

echo "OK: probe B fired — $(grep -c 'under the 4.5 bar' "$LOG") template(s) reported unreadable."
