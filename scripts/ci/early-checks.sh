#!/usr/bin/env bash
set -euo pipefail

node --check server/website-doctor-api.mjs
node --check public/scripts/website-doctor.js
node --check extension/website-doctor/popup.js
node -e "JSON.parse(require('fs').readFileSync('extension/website-doctor/manifest.json', 'utf8'))"

while IFS= read -r -d '' migration; do
  node --check "$migration"
done < <(find directus/migrations -type f \( -name '*.js' -o -name '*.mjs' \) -print0 2>/dev/null || true)

docker compose config -q

test -s package.json
test -s package-lock.json
test -s compose.yaml
test -s docker/nginx.conf

echo "Early syntax/config checks passed."
