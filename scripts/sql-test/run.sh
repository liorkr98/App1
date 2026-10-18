#!/usr/bin/env bash
#
# Runs the billing SQL tests on a throwaway Postgres 16 (CLAUDE.md §8).
#
# The production database cannot be exercised from CI, and the publish gate
# is SQL, so this is where it is proven: a fresh cluster, Supabase's auth
# stubbed (bootstrap.sql), the migrations the gate depends on, then 0040
# and 0045, then tests.sql and plan-limits.sql. Any failed assertion raises
# and the script exits non-zero.
#
#   bash scripts/sql-test/run.sh

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PG_TEST_PORT:-55432}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  id pgtest >/dev/null 2>&1 || useradd -M -s /bin/false pgtest
  chown -R pgtest "$WORK"
  RUN_AS=(runuser -u pgtest --)
fi

cleanup() {
  "${RUN_AS[@]}" "$BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"${RUN_AS[@]}" "$BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null

PSQL=("$BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$HERE/bootstrap.sql"
for migration in 0001 0002 0009 0011 0013 0016 0017 0019 0022 0029 0030 0040 0041 0042 0043 0044; do
  file="$(ls "$ROOT"/supabase/migrations/${migration}_*.sql)"
  "${PSQL[@]}" -f "$file" >/dev/null 2>&1 || { "${PSQL[@]}" -f "$file"; exit 1; }
done
# Run twice: the migration says it is safe to.
"${PSQL[@]}" -f "$(ls "$ROOT"/supabase/migrations/0040_*.sql)" >/dev/null
# 0045 replaces the decision 0040 wrote, so it comes after that second run:
# every billing test below runs on the plan page limits. Sent the way the
# Supabase SQL editor sends a pasted file, twice.
"${PSQL[@]}" -c "$(cat "$(ls "$ROOT"/supabase/migrations/0045_*.sql)")" >/dev/null
"${PSQL[@]}" -c "$(cat "$(ls "$ROOT"/supabase/migrations/0045_*.sql)")" >/dev/null

"${PSQL[@]}" -f "$HERE/tests.sql"
# 0041 twice too, then the agent pages.
"${PSQL[@]}" -f "$(ls "$ROOT"/supabase/migrations/0041_*.sql)" >/dev/null
"${PSQL[@]}" -f "$HERE/agent-pages.sql"
# 0042 twice too, then the data page.
"${PSQL[@]}" -f "$(ls "$ROOT"/supabase/migrations/0042_*.sql)" >/dev/null
"${PSQL[@]}" -f "$HERE/site-analytics.sql"
# 0043 sent the way the Supabase SQL editor sends a pasted file: one string.
"${PSQL[@]}" -c "$(cat "$(ls "$ROOT"/supabase/migrations/0043_*.sql)")" >/dev/null
"${PSQL[@]}" -f "$HERE/price-drop.sql"
# 0044 the same way, twice, then the translations.
"${PSQL[@]}" -c "$(cat "$(ls "$ROOT"/supabase/migrations/0044_*.sql)")" >/dev/null
"${PSQL[@]}" -f "$HERE/listing-translations.sql"
"${PSQL[@]}" -f "$HERE/plan-limits.sql"
bash "$HERE/race.sh" "$BIN" "$WORK" "$PORT"
echo "OK: billing, agent-page, site-analytics, price-drop, translation and plan-limit SQL tests passed."
