#!/usr/bin/env bash
set -euo pipefail

: "${APP_DIR:?APP_DIR is required}"
: "${PUBLIC_HEALTH_URL:=https://webigram.ir/healthz}"
: "${SERVER_CHANGED:=false}"
: "${DIRECTUS_CHANGED:=false}"
: "${COMPOSE_CHANGED:=false}"
: "${NGINX_CHANGED:=false}"

rollback_dir="$APP_DIR/.deploy-rollback"
deployment_id="${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}"

active_run=$(cat "$rollback_dir/active-run" 2>/dev/null || true)
snapshot_run=$(cat "$rollback_dir/snapshot-run" 2>/dev/null || true)

if [ "$active_run" != "$deployment_id" ]; then
  echo "No production mutation was started by this run; rollback is unnecessary."
  exit 0
fi

if [ "$snapshot_run" != "$deployment_id" ] || [ ! -s "$rollback_dir/main.sha" ] || [ ! -s "$rollback_dir/dist/index.html" ]; then
  echo "No rollback snapshot belongs to this run; refusing to restore stale data."
  exit 0
fi

previous_sha=$(cat "$rollback_dir/main.sha")
echo "Restoring previous production revision: $previous_sha"
git -C "$APP_DIR" checkout -B main "$previous_sha"

mkdir -p "$APP_DIR/dist"
cp -a "$rollback_dir/dist/." "$APP_DIR/dist/"

cd "$APP_DIR"
if [ "$COMPOSE_CHANGED" = "true" ] || [ "$SERVER_CHANGED" = "true" ] || \
   [ "$DIRECTUS_CHANGED" = "true" ] || [ "$NGINX_CHANGED" = "true" ]; then
  docker compose up -d --remove-orphans
fi

curl -fsS --connect-timeout 3 --max-time 10 --retry 2 \
  "${PUBLIC_HEALTH_URL}?rollback=${GITHUB_SHA:-manual}" >/dev/null

echo "Rollback completed."
