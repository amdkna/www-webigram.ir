#!/usr/bin/env bash
set -euo pipefail

registries=(
  "https://registry.npmjs.org/"
  "https://package-mirror.liara.ir/repository/npm/"
  "https://mirror2.chabokan.net/npm/"
  "https://npm.iranserver.com/repository/npm/"
)

probe_timeout="${NPM_PROBE_TIMEOUT_SECONDS:-6}"
install_timeout="${NPM_INSTALL_TIMEOUT_SECONDS:-120}"
fetch_timeout="${NPM_FETCH_TIMEOUT_MS:-10000}"

for registry in "${registries[@]}"; do
  echo "Probing npm registry: $registry"

  if ! timeout "${probe_timeout}s" npm view astro version --silent \
    --registry="$registry" --fetch-retries=0 --fetch-timeout="$fetch_timeout" \
    >/dev/null 2>&1; then
    echo "Registry did not answer quickly enough; trying next mirror."
    continue
  fi

  echo "Using npm registry: $registry"
  if timeout "${install_timeout}s" npm ci \
    --registry="$registry" \
    --fetch-retries=0 \
    --fetch-timeout="$fetch_timeout" \
    --fetch-retry-mintimeout=1000 \
    --fetch-retry-maxtimeout=3000 \
    --no-audit --no-fund --prefer-offline; then
    echo "npm install completed via $registry"
    exit 0
  fi

  echo "npm install failed via $registry; trying next mirror."
done

echo "ERROR: npm install failed on the official registry and all configured mirrors." >&2
exit 1
