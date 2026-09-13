#!/usr/bin/env bash
set -euo pipefail

required=(
  dist/index.html
  dist/home5/index.html
  dist/test6/index.html
  dist/home6/index.html
  dist/services/index.html
  dist/portfolio/index.html
  dist/contact/index.html
  dist/blog/index.html
  dist/tools/website-doctor/index.html
  dist/downloads/webigram-website-doctor-chrome.zip
)

for file in "${required[@]}"; do
  test -s "$file" || {
    echo "ERROR: required build artifact is missing or empty: $file" >&2
    exit 1
  }
done

unzip -tq dist/downloads/webigram-website-doctor-chrome.zip >/dev/null

echo "Production dist verification passed."
