#!/usr/bin/env bash
set -Eeuo pipefail

: "${APP_DIR:?APP_DIR is required}"
: "${SOURCE_DIR:?SOURCE_DIR is required}"
: "${RELEASE_DIR:?RELEASE_DIR is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GITHUB_RUN_ATTEMPT:=1}"
: "${SITE_CHANGED:=false}"
: "${SERVER_CHANGED:=false}"
: "${DIRECTUS_CHANGED:=false}"
: "${COMPOSE_CHANGED:=false}"
: "${NGINX_CHANGED:=false}"
: "${PUBLIC_HEALTH_URL:=https://webigram.ir/healthz}"
: "${EDGE_CONTAINER:=edge-nginx}"

export APP_DIR SOURCE_DIR RELEASE_DIR GITHUB_SHA GITHUB_RUN_ID GITHUB_RUN_ATTEMPT
export SITE_CHANGED SERVER_CHANGED DIRECTUS_CHANGED COMPOSE_CHANGED NGINX_CHANGED
export PUBLIC_HEALTH_URL EDGE_CONTAINER

log_dir="$APP_DIR/.deploy-logs"
mkdir -p "$log_dir"
log_file="$log_dir/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.log"
exec > >(tee -a "$log_file") 2>&1
find "$log_dir" -type f -name '*.log' -mtime +30 -delete 2>/dev/null || true

echo "=== Webigram remote deployment ==="
echo "Revision: $GITHUB_SHA"
echo "Run: ${GITHUB_RUN_ID}/${GITHUB_RUN_ATTEMPT}"
echo "Changes: site=$SITE_CHANGED server=$SERVER_CHANGED directus=$DIRECTUS_CHANGED compose=$COMPOSE_CHANGED nginx=$NGINX_CHANGED"

cid=""
cleanup_container() {
  if [ -n "$cid" ]; then
    docker rm -f "$cid" >/dev/null 2>&1 || true
  fi
}
trap cleanup_container EXIT

rollback_on_error() {
  rc=$?
  trap - ERR
  set +e
  echo "Deployment failed with exit code $rc. Checking guarded rollback..."
  if [ -f "$APP_DIR/scripts/deploy/rollback-release.sh" ]; then
    timeout --signal=TERM --kill-after=5s 60s \
      bash "$APP_DIR/scripts/deploy/rollback-release.sh"
    rollback_rc=$?
    if [ "$rollback_rc" -ne 0 ]; then
      echo "Rollback command also failed with exit code $rollback_rc."
    fi
  else
    echo "Rollback helper is unavailable; no rollback attempted."
  fi
  exit "$rc"
}
trap rollback_on_error ERR

if [ "$SITE_CHANGED" = "true" ]; then
  echo "Building static release on wbg-001 using the persistent Docker cache..."
  image="webigram-build:deploy"
  cd "$SOURCE_DIR"
  timeout 120s docker build --target build --tag "$image" .

  cid=$(docker create "$image")
  timeout 30s docker cp "$cid:/app/dist/." "$RELEASE_DIR/"
  cleanup_container
  cid=""

  test -s "$RELEASE_DIR/index.html"
  test -s "$RELEASE_DIR/portfolio/index.html"
  test -s "$RELEASE_DIR/services/index.html"
  echo "Static release built successfully."
else
  echo "No site build required for this revision."
fi

echo "Creating rollback snapshot and syncing production source..."
cd "$SOURCE_DIR"
timeout 45s bash scripts/deploy/sync-release.sh

echo "Applying only changed runtime services..."
cd "$APP_DIR"
timeout 180s bash scripts/deploy/apply-runtime.sh

smoke_timeout=90
if [ "$DIRECTUS_CHANGED" = "true" ] || [ "$COMPOSE_CHANGED" = "true" ]; then
  smoke_timeout=180
fi

echo "Running change-aware smoke checks with ${smoke_timeout}s hard timeout..."
timeout --signal=TERM --kill-after=5s "${smoke_timeout}s" \
  bash scripts/deploy/verify-release.sh

printf '%s\n' "$GITHUB_SHA" > "$APP_DIR/.last-successful-deploy"
echo "Successful production revision: $GITHUB_SHA"
echo "Local deployment log: $log_file"

trap - ERR
echo "=== Deployment completed successfully ==="
