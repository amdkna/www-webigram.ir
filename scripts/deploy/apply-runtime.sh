#!/usr/bin/env bash
set -euo pipefail

: "${COMPOSE_CHANGED:=false}"
: "${SERVER_CHANGED:=false}"
: "${DIRECTUS_CHANGED:=false}"
: "${NGINX_CHANGED:=false}"
: "${EDGE_CONTAINER:=edge-nginx}"

docker network inspect public_proxy >/dev/null 2>&1 || docker network create public_proxy
docker network inspect app-net >/dev/null 2>&1 || docker network create app-net

if [ "$COMPOSE_CHANGED" = "true" ]; then
  echo "compose.yaml changed: reconciling Compose services"
  docker compose up -d --remove-orphans
fi

if [ "$SERVER_CHANGED" = "true" ] && [ "$COMPOSE_CHANGED" != "true" ]; then
  echo "server code changed: recreating API services"
  docker compose up -d --no-deps --force-recreate website-doctor-api brand-checker-api
fi

if [ "$DIRECTUS_CHANGED" = "true" ]; then
  echo "Directus changed: entering CMS slow path"
  bash scripts/deploy/reconcile-directus.sh
fi

if [ "$NGINX_CHANGED" = "true" ]; then
  echo "nginx config changed: recreating only webigram"
  docker compose up -d --no-deps --force-recreate webigram
fi
