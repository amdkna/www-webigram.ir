#!/usr/bin/env bash
set -euo pipefail

RUNNER_DIR="${RUNNER_DIR:-/opt/github-runners/webigram.ir}"
DEST_ROOT="${DEST_ROOT:-/var/log/github-actions-local/webigram-ir-wbg-001}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

DIAG_SRC="$RUNNER_DIR/_diag"
BLOCKS_SRC="$DIAG_SRC/blocks"
DIAG_DEST="$DEST_ROOT/diag"
BLOCKS_DEST="$DEST_ROOT/results-blocks"

mkdir -p "$DIAG_DEST" "$BLOCKS_DEST"

copy_matching_files() {
  local source_dir="$1"
  local destination_dir="$2"
  shift 2

  [ -d "$source_dir" ] || return 0

  local pattern file
  for pattern in "$@"; do
    while IFS= read -r -d '' file; do
      cp -p -- "$file" "$destination_dir/$(basename "$file")"
    done < <(find "$source_dir" -maxdepth 1 -type f -name "$pattern" -print0 2>/dev/null)
  done
}

copy_matching_files "$DIAG_SRC" "$DIAG_DEST" \
  'Worker_*.log' \
  'Runner_*.log' \
  'SelfUpdate-*.log'

copy_matching_files "$BLOCKS_SRC" "$BLOCKS_DEST" '*'

find "$DEST_ROOT" -type f -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

chmod 0755 "$DEST_ROOT" "$DIAG_DEST" "$BLOCKS_DEST"
find "$DEST_ROOT" -type f -exec chmod 0640 {} + 2>/dev/null || true
