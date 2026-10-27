#!/usr/bin/env bash
set -euo pipefail

node scripts/fetch-mountain-asset.mjs
npm run build

archive="dist/downloads/webigram-website-doctor-chrome.zip"
source_dir="extension/website-doctor"

mkdir -p dist/downloads
rm -f "$archive"

if command -v zip >/dev/null 2>&1; then
  (
    cd "$source_dir"
    zip -qr "../../$archive" .
  )
elif command -v python3 >/dev/null 2>&1; then
  python3 - "$source_dir" "$archive" <<'PY'
from pathlib import Path
import sys
import zipfile

source = Path(sys.argv[1])
archive = Path(sys.argv[2])

with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(source.rglob("*")):
        if path.is_file():
            zf.write(path, path.relative_to(source))

print(f"Created {archive} with Python zipfile fallback.")
PY
else
  echo "Neither zip nor python3 is available; cannot package the Chrome extension." >&2
  exit 127
fi

test -s "$archive"
