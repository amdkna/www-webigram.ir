#!/usr/bin/env bash
set -euo pipefail

: "${SITE_CHANGED:=false}"
: "${SERVER_CHANGED:=false}"
: "${DIRECTUS_CHANGED:=false}"
: "${COMPOSE_CHANGED:=false}"
: "${NGINX_CHANGED:=false}"
: "${EDGE_CONTAINER:=edge-nginx}"
: "${PUBLIC_HEALTH_URL:=https://webigram.ir/healthz}"

if [ "$SERVER_CHANGED" = "true" ] || [ "$COMPOSE_CHANGED" = "true" ]; then
  api_ready=0
  for _ in $(seq 1 20); do
    if docker exec webigram-website-doctor-api node -e \
      "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
      api_ready=1
      break
    fi
    sleep 1
  done
  [ "$api_ready" -eq 1 ] || {
    docker logs --tail 120 webigram-website-doctor-api || true
    exit 1
  }
fi

if [ "$DIRECTUS_CHANGED" = "true" ] || [ "$COMPOSE_CHANGED" = "true" ]; then
  cms_ready=0
  for _ in $(seq 1 60); do
    if docker exec webigram-directus node -e \
      "fetch('http://127.0.0.1:8055/server/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
      cms_ready=1
      break
    fi
    sleep 2
  done
  [ "$cms_ready" -eq 1 ] || {
    docker logs --tail 180 webigram-directus || true
    exit 1
  }
fi

if [ "$NGINX_CHANGED" = "true" ] || [ "$COMPOSE_CHANGED" = "true" ]; then
  docker exec webigram-web nginx -t
  docker exec webigram-web nginx -s reload
  docker exec "$EDGE_CONTAINER" nginx -t
  docker exec "$EDGE_CONTAINER" nginx -s reload
fi

public_ready=0
for _ in $(seq 1 12); do
  if curl -fsS --connect-timeout 2 --max-time 4 \
    "${PUBLIC_HEALTH_URL}?deploy=${GITHUB_SHA:-manual}" >/dev/null; then
    public_ready=1
    break
  fi
  sleep 1
done
[ "$public_ready" -eq 1 ]

curl -fsS --connect-timeout 3 --max-time 8 \
  "https://webigram.ir/?deploy=${GITHUB_SHA:-manual}" >/dev/null

if [ "$SITE_CHANGED" = "true" ]; then
  page="${RUNNER_TEMP:-/tmp}/webigram-portfolio.html"
  curl -fsS --connect-timeout 3 --max-time 8 \
    "https://webigram.ir/portfolio/?deploy=${GITHUB_SHA:-manual}" -o "$page"
  grep -Fq 'data-portfolio-grid' "$page"
fi
