#!/usr/bin/env bash
#
# The last launch seat, bought twice at the same moment (PRICING.md §9: the
# counter is race-safe under concurrent payments). Two sessions pay; the
# first holds its transaction open; the second must wait on the row lock and
# then find the cohort full. Exactly one launch plan, the other regular.
set -euo pipefail
BIN="$1"; SOCK="$2"; PORT="$3"
PSQL=("$BIN/psql" -h "$SOCK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -At)

"${PSQL[@]}" <<'SQL'
update public.cohort_counters set used = 99, cap = 100 where cohort = 'dealer_launch';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'race1@test'),
  ('00000000-0000-0000-0000-0000000000a2', 'race2@test');
SQL

pay() {
  "${PSQL[@]}" -c "begin; set local role service_role;
    select public.apply_payment_event('race-$1', 'subscription_paid', '00000000-0000-0000-0000-0000000000a$1', 'dealer_launch');
    select pg_sleep($2); commit;"
}

pay 1 1.5 > "$SOCK/race1" &
first=$!
sleep 0.4
pay 2 0 > "$SOCK/race2" &
second=$!
wait "$first" "$second"

results="$(cat "$SOCK/race1" "$SOCK/race2" | grep -E '^(dealer|dealer_launch)$' | sort | tr '\n' ' ')"
used="$("${PSQL[@]}" -c "select used from public.cohort_counters where cohort = 'dealer_launch'")"

if [ "$results" != "dealer dealer_launch " ] || [ "$used" != "100" ]; then
  echo "FAILED: concurrent payments for the last seat gave [$results] with used=$used"
  exit 1
fi
echo "ok  two payments for the last seat: one launch, one regular, counter at its cap"
