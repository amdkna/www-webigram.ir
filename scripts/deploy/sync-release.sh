#!/usr/bin/env bash
set -euo pipefail

: "${APP_DIR:?APP_DIR is required}"
: "${SITE_CHANGED:=false}"
: "${RELEASE_DIR:=${RUNNER_TEMP:-/tmp}/webigram-dist}"

mkdir -p "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone https://github.com/amdkna/www-webigram.ir.git "$APP_DIR"
fi

rollback_dir="$APP_DIR/.deploy-rollback"
mkdir -p "$rollback_dir/dist"

if [ -f "$APP_DIR/.last-successful-deploy" ]; then
  cp "$APP_DIR/.last-successful-deploy" "$rollback_dir/main.sha"
elif git -C "$APP_DIR" rev-parse --verify HEAD >/dev/null 2>&1; then
  git -C "$APP_DIR" rev-parse HEAD > "$rollback_dir/main.sha"
fi

if [ -s "$APP_DIR/dist/index.html" ]; then
  cp -a "$APP_DIR/dist/." "$rollback_dir/dist/"
  touch "$rollback_dir/available"
fi

git -C "$APP_DIR" fetch --prune origin main
git -C "$APP_DIR" checkout -B main origin/main

if [ "$SITE_CHANGED" = "true" ]; then
  test -s "$RELEASE_DIR/index.html"
  test -s "$RELEASE_DIR/services/index.html"
  test -s "$RELEASE_DIR/portfolio/index.html"
  test -s "$RELEASE_DIR/contact/index.html"
  test -s "$RELEASE_DIR/blog/index.html"
  mkdir -p "$APP_DIR/dist"
  cp -a "$RELEASE_DIR/." "$APP_DIR/dist/"
fi
