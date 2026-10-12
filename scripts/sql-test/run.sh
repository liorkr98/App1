#!/usr/bin/env bash
#
# Runs the billing SQL tests on a throwaway Postgres 16 (CLAUDE.md §8).
#
# The production database cannot be exercised from CI, and the publish gate
# is SQL, so this is where it is proven: a fresh cluster, Supabase's auth
# stubbed (bootstrap.sql), the migrations the gate depends on, then 0040,
# then tests.sql. Any failed assertion raises and the script exits non-zero.
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
for migration in 0001 0002 0009 0013 0016 0022 0040; do
  file="$(ls "$ROOT"/supabase/migrations/${migration}_*.sql)"
  "${PSQL[@]}" -f "$file" >/dev/null 2>&1 || { "${PSQL[@]}" -f "$file"; exit 1; }
done
# Run twice: the migration says it is safe to.
"${PSQL[@]}" -f "$(ls "$ROOT"/supabase/migrations/0040_*.sql)" >/dev/null

"${PSQL[@]}" -f "$HERE/tests.sql"
bash "$HERE/race.sh" "$BIN" "$WORK" "$PORT"
echo "OK: billing SQL tests passed."
