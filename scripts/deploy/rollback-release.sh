#!/usr/bin/env bash
set -euo pipefail

: "${APP_DIR:?APP_DIR is required}"
: "${PUBLIC_HEALTH_URL:=https://webigram.ir/healthz}"
: "${SERVER_CHANGED:=false}"
: "${DIRECTUS_CHANGED:=false}"
: "${COMPOSE_CHANGED:=false}"
: "${NGINX_CHANGED:=false}"

rollback_dir="$APP_DIR/.deploy-rollback"

test -f "$rollback_dir/available"
test -s "$rollback_dir/dist/index.html"

if [ -s "$rollback_dir/main.sha" ]; then
  previous_sha=$(cat "$rollback_dir/main.sha")
  git -C "$APP_DIR" checkout -B main "$previous_sha"
fi

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
