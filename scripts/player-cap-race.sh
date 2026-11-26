#!/usr/bin/env bash
# The player cap under real concurrency (docs/74 §7): a throwaway Postgres cluster, migration 0157 on stand-ins for
# Supabase's pieces, then many joins and heartbeats at once, each on its own connection. Passes when the players let in
# never exceed the cap. PGlite (tests/player-cap-sql.test.ts) runs one connection, so it can't show this.
#
#   bash scripts/player-cap-race.sh            # 200 joins at once, cap 10
#   JOINS=500 CAP=25 bash scripts/player-cap-race.sh
#
# Needs a local Postgres (initdb, pg_ctl, psql). As root, it runs the cluster as the `postgres` user.
set -euo pipefail

JOINS=${JOINS:-200}
CAP=${CAP:-10}
PORT=${PORT:-54329}
BIN=${PG_BIN:-$(dirname "$(ls /usr/lib/postgresql/*/bin/postgres 2>/dev/null | sort -V | tail -1)")}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DIR=$(mktemp -d)
chmod 777 "$DIR"
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
cleanup() { as_pg "$BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

as_pg "$BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
as_pg "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c max_connections=600" -l "$DIR/log" -w start >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$BIN/psql" -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt)

"${PSQL[@]}" >/dev/null <<'SQL'
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), ''))) $$;
create function is_admin() returns boolean language sql stable as $$ select coalesce(auth.jwt() ->> 'email', '') = 'admin' $$;
create table game_config (key text primary key, value jsonb);
create table beta_testers (user_id uuid primary key, added_at timestamptz not null default now(), note text);
create table players (player text primary key, user_id uuid, name text, email text, last_day date);
create function online_ping(text, text, text, int, jsonb) returns int language sql as $$ select 0 $$;
SQL
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0157_player_cap.sql" >/dev/null
"${PSQL[@]}" -c "update game_config set value = value || '{\"access\": \"all\", \"cap\": $CAP}' where key = 'ccu'" >/dev/null

echo "Joining $JOINS players at once, cap $CAP…"
for i in $(seq 1 "$JOINS"); do
  "${PSQL[@]}" -c "select ccu_join('race-$i') ->> 'status'" >"$DIR/join-$i" 2>&1 &
done
wait
active=$(cat "$DIR"/join-* | grep -c '^active$' || true)
queued=$(cat "$DIR"/join-* | grep -c '^queued$' || true)
other=$((JOINS - active - queued))
echo "Answers: $active active, $queued queued, $other other"

# Half the players leave at once while the other half beat: the line moves, still within the cap.
"${PSQL[@]}" -c "update ccu_sessions set left_at = now() - interval '2 minutes' where status = 'active'" >/dev/null
"${PSQL[@]}" -c "update ccu_state set ticked_at = now() - interval '1 minute'" >/dev/null
for t in $("${PSQL[@]}" -c "select token from ccu_sessions where status = 'queued'"); do
  "${PSQL[@]}" -c "select ccu_heartbeat('$t') ->> 'status'" >/dev/null 2>&1 &
  "${PSQL[@]}" -c "select ccu_join('late-$RANDOM-$RANDOM') ->> 'status'" >/dev/null 2>&1 &
done
wait
"${PSQL[@]}" -c "update ccu_state set ticked_at = now() - interval '1 minute'" >/dev/null
"${PSQL[@]}" -c "select ccu_join('last-one')" >/dev/null

read -r live_active live_queued <<<"$("${PSQL[@]}" -F ' ' -c \
  "select count(*) filter (where status = 'active'), count(*) filter (where status = 'queued') from ccu_sessions s where ccu_live(s, ccu_cfg())")"
order_ok=$("${PSQL[@]}" -c "select bool_and(queued_at is not null and queue_seq is not null) from ccu_sessions where status = 'queued'")
echo "After the leaves and heartbeats: $live_active in, $live_queued waiting"

fail=0
[ "$other" -eq 0 ] || { echo "FAIL: $other joins errored"; grep -hv '^active$\|^queued$' "$DIR"/join-* | head -5; fail=1; }
[ "$active" -eq "$CAP" ] || { echo "FAIL: $active let in at once, the cap is $CAP"; fail=1; }
[ "$live_active" -eq "$CAP" ] || { echo "FAIL: $live_active in after the second wave, the cap is $CAP"; fail=1; }
[ "$order_ok" = t ] || { echo "FAIL: a waiting session has no place in line"; fail=1; }
[ "$fail" = 0 ] && echo "PASS: never more than $CAP in"
exit "$fail"
