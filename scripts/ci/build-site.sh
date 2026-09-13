#!/usr/bin/env bash
set -euo pipefail

node scripts/fetch-mountain-asset.mjs
npm run build

mkdir -p dist/downloads
rm -f dist/downloads/webigram-website-doctor-chrome.zip
(
  cd extension/website-doctor
  zip -qr ../../dist/downloads/webigram-website-doctor-chrome.zip .
)
