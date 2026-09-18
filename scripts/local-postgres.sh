#!/usr/bin/env bash
# Start a throwaway PostgreSQL cluster for development and for the API gate.
#
# Nothing here is part of the deployed system — it exists so that
# `npm run check:api` can prove the HTTP repository against a real database
# rather than a stub. A stubbed database would prove the test, not the code.
#
#   scripts/local-postgres.sh start   # prints the DATABASE_URL to use
#   scripts/local-postgres.sh stop
#
# PGPORT and PGDIR can be overridden to run a second instance side by side,
# which is how the portability drill checks the schema against two clusters.
set -euo pipefail

PORT="${PGPORT:-5433}"
DIR="${PGDIR:-${TMPDIR:-/tmp}/tazayud-pg-$PORT}"
DB="${PGDATABASE:-pmo}"
USER_NAME="${PGUSER:-pmo}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"

if [ -z "$BIN" ]; then
  echo "PostgreSQL server binaries not found (expected /usr/lib/postgresql/*/bin)" >&2
  exit 1
fi

# initdb refuses to run as root, so the cluster is owned by the postgres user.
# That means every directory above it has to be traversable by that user.
as_postgres() {
  if [ "$(id -u)" -eq 0 ]; then su postgres -c "$1"; else sh -c "$1"; fi
}

case "${1:-start}" in
  start)
    if [ ! -s "$DIR/PG_VERSION" ]; then
      rm -rf "$DIR"
      mkdir -p "$DIR"
      if [ "$(id -u)" -eq 0 ]; then
        # Make the whole path traversable, then hand the data directory over.
        p=""
        IFS='/' read -ra segments <<< "$DIR"
        for segment in "${segments[@]}"; do
          [ -z "$segment" ] && continue
          p="$p/$segment"
          chmod o+x "$p" 2>/dev/null || true
        done
        chown postgres "$DIR"
        chmod 700 "$DIR"
      fi
      as_postgres "$BIN/initdb -D '$DIR' -U '$USER_NAME' --auth=trust" >"$DIR.initdb.log" 2>&1
    fi

    if ! as_postgres "$BIN/pg_ctl -D '$DIR' status" >/dev/null 2>&1; then
      as_postgres "$BIN/pg_ctl -D '$DIR' \
        -o '-p $PORT -k $DIR -c listen_addresses=127.0.0.1' \
        -l '$DIR/server.log' start" >/dev/null
    fi

    for _ in $(seq 1 30); do
      if psql -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" -d postgres -c 'select 1' >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done

    psql -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" -d postgres \
      -tAc "select 1 from pg_database where datname='$DB'" | grep -q 1 \
      || createdb -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" "$DB"

    echo "postgres://$USER_NAME@127.0.0.1:$PORT/$DB"
    ;;

  stop)
    as_postgres "$BIN/pg_ctl -D '$DIR' -m immediate stop" >/dev/null 2>&1 || true
    ;;

  *)
    echo "usage: $0 {start|stop}" >&2
    exit 1
    ;;
esac
