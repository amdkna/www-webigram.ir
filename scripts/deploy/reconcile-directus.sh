#!/usr/bin/env bash
set -euo pipefail

# This slow path only runs when Directus or compose.yaml changes.
docker compose up -d directus-secrets-init directus-db

db_ready=0
for _ in $(seq 1 30); do
  if docker exec webigram-directus-db pg_isready -U directus -d directus >/dev/null 2>&1; then
    db_ready=1
    break
  fi
  sleep 1
done

[ "$db_ready" -eq 1 ] || {
  docker logs --tail 120 webigram-directus-db || true
  exit 1
}

docker compose exec -T directus-db sh -s <<'DB_SYNC'
set -eu
CURRENT_PASSWORD="$(cat /run/directus-secrets/db_password)"

if PGPASSWORD="$CURRENT_PASSWORD" psql \
  -h 127.0.0.1 -U directus -d directus \
  -v ON_ERROR_STOP=1 -Atqc "SELECT 1" >/dev/null 2>&1; then
  echo "Directus DB credentials are aligned."
  exit 0
fi

echo "Directus DB credential drift detected; repairing role password."
psql -U directus -d directus \
  -v ON_ERROR_STOP=1 \
  -v db_password="$CURRENT_PASSWORD" <<'SQL' >/dev/null
ALTER ROLE directus WITH PASSWORD :'db_password';
SQL

PGPASSWORD="$CURRENT_PASSWORD" psql \
  -h 127.0.0.1 -U directus -d directus \
  -v ON_ERROR_STOP=1 -Atqc "SELECT 1" >/dev/null
DB_SYNC

docker compose up -d --no-deps --force-recreate directus
