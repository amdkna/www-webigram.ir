#!/usr/bin/env bash
set -euo pipefail

RUNNER_SERVICE="${RUNNER_SERVICE:-actions.runner.amdkna-www-webigram.ir.webigram-ir-wbg-001.service}"
DROPIN_FILE="/etc/systemd/system/${RUNNER_SERVICE}.d/30-fast-fail-filter.conf"
ARCHIVE_SERVICE="/etc/systemd/system/webigram-github-runner-local-results.service"
ARCHIVE_TIMER="/etc/systemd/system/webigram-github-runner-local-results.timer"
PRESERVER_DST="/usr/local/sbin/webigram-runner-preserve-results"
KEEP_LOGS="${KEEP_LOGS:-1}"
DEST_ROOT="${DEST_ROOT:-/var/log/github-actions-local/webigram-ir-wbg-001}"

if [ "${EUID}" -ne 0 ]; then
  echo "Run this rollback with sudo." >&2
  exit 1
fi

systemctl disable --now webigram-github-runner-local-results.timer 2>/dev/null || true
rm -f "$ARCHIVE_TIMER" "$ARCHIVE_SERVICE" "$DROPIN_FILE" "$PRESERVER_DST"

systemctl daemon-reload
systemctl restart "$RUNNER_SERVICE"

if [ "$KEEP_LOGS" != "1" ]; then
  rm -rf "$DEST_ROOT"
fi

echo "Runner resilience override removed."
echo "Local logs kept at $DEST_ROOT (KEEP_LOGS=$KEEP_LOGS)."
systemctl --no-pager --full status "$RUNNER_SERVICE" || true
