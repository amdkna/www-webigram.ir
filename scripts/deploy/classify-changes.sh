#!/usr/bin/env bash
set -euo pipefail

before_sha="${1:-}"
head_sha="${2:-HEAD}"
event_name="${3:-push}"
output_file="${4:-${GITHUB_OUTPUT:-/dev/stdout}}"

site_changed=false
server_changed=false
directus_changed=false
compose_changed=false
nginx_changed=false

if [ "$event_name" = "workflow_dispatch" ] || [ -z "$before_sha" ] || \
   [ "$before_sha" = "0000000000000000000000000000000000000000" ]; then
  site_changed=true
  server_changed=true
  directus_changed=true
  compose_changed=true
  nginx_changed=true
  echo "Manual/unknown base: treating all areas as changed."
else
  changed_files=$(git diff --name-only "$before_sha" "$head_sha")
  printf '%s\n' "$changed_files"

  while IFS= read -r file; do
    [ -n "$file" ] || continue
    case "$file" in
      src/*|public/*|extension/*|astro.config.*|package.json|package-lock.json|Dockerfile|scripts/fetch-mountain-asset.mjs|scripts/ci/*|scripts/deploy/classify-changes.sh|.github/workflows/deploy-fast.yml)
        site_changed=true ;;
    esac
    case "$file" in server/*) server_changed=true ;; esac
    case "$file" in directus/*) directus_changed=true ;; esac
    case "$file" in compose.yaml) compose_changed=true ;; esac
    case "$file" in docker/nginx.conf) nginx_changed=true ;; esac
  done <<< "$changed_files"
fi

{
  echo "site_changed=$site_changed"
  echo "server_changed=$server_changed"
  echo "directus_changed=$directus_changed"
  echo "compose_changed=$compose_changed"
  echo "nginx_changed=$nginx_changed"
} >> "$output_file"
