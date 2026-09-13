#!/usr/bin/env bash
set -euo pipefail

RUNNER_DIR="${RUNNER_DIR:-/opt/github-runners/webigram.ir}"
RUNNER_SERVICE="${RUNNER_SERVICE:-actions.runner.amdkna-www-webigram.ir.webigram-ir-wbg-001.service}"
FILTER_IP="${FILTER_IP:-10.10.34.35}"
DEST_ROOT="${DEST_ROOT:-/var/log/github-actions-local/webigram-ir-wbg-001}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
FORCE="${FORCE:-0}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PRESERVER_SRC="$SCRIPT_DIR/preserve-results.sh"
PRESERVER_DST="/usr/local/sbin/webigram-runner-preserve-results"
DROPIN_DIR="/etc/systemd/system/${RUNNER_SERVICE}.d"
DROPIN_FILE="$DROPIN_DIR/30-fast-fail-filter.conf"
ARCHIVE_SERVICE="/etc/systemd/system/webigram-github-runner-local-results.service"
ARCHIVE_TIMER="/etc/systemd/system/webigram-github-runner-local-results.timer"

if [ "${EUID}" -ne 0 ]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

if [ ! -d "$RUNNER_DIR" ]; then
  echo "Runner directory not found: $RUNNER_DIR" >&2
  exit 1
fi

if [ ! -f "$PRESERVER_SRC" ]; then
  echo "Missing helper: $PRESERVER_SRC" >&2
  exit 1
fi

if ! systemctl cat "$RUNNER_SERVICE" >/dev/null 2>&1; then
  echo "Runner service not found: $RUNNER_SERVICE" >&2
  exit 1
fi

if pgrep -f "^${RUNNER_DIR}/.*Runner\.Worker" >/dev/null 2>&1; then
  if [ "$FORCE" != "1" ]; then
    echo "A Runner.Worker is active. Refusing to restart the runner during a job." >&2
    echo "Wait for the current job to finish, then run this installer again." >&2
    echo "If you intentionally want to interrupt it, run with FORCE=1." >&2
    exit 2
  fi
fi

install -d -m 0755 "$DEST_ROOT" "$DEST_ROOT/diag" "$DEST_ROOT/results-blocks"
install -m 0755 "$PRESERVER_SRC" "$PRESERVER_DST"

install -d -m 0755 "$DROPIN_DIR"
cat > "$DROPIN_FILE" <<EOF
[Service]
# Iran filtering DNS currently resolves blocked Azure Blob hosts to this sink IP.
# Deny it only inside this runner's cgroup so connections fail immediately
# instead of hanging for the Azure SDK's 30-second network timeout.
IPAddressDeny=${FILTER_IP}/32
EOF

cat > "$ARCHIVE_SERVICE" <<EOF
[Unit]
Description=Archive Webigram GitHub runner logs and failed Results blocks locally
After=local-fs.target

[Service]
Type=oneshot
Environment=RUNNER_DIR=${RUNNER_DIR}
Environment=DEST_ROOT=${DEST_ROOT}
Environment=RETENTION_DAYS=${RETENTION_DAYS}
ExecStart=${PRESERVER_DST}
EOF

cat > "$ARCHIVE_TIMER" <<'EOF'
[Unit]
Description=Periodically archive Webigram GitHub runner local results

[Timer]
OnBootSec=30s
OnUnitActiveSec=30s
AccuracySec=5s
Persistent=true
Unit=webigram-github-runner-local-results.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload

# Preserve what already exists before the runner is restarted.
RUNNER_DIR="$RUNNER_DIR" DEST_ROOT="$DEST_ROOT" RETENTION_DAYS="$RETENTION_DAYS" \
  "$PRESERVER_DST" || true

systemctl enable --now webigram-github-runner-local-results.timer
systemctl restart "$RUNNER_SERVICE"

sleep 2

echo
echo "Installed runner resilience settings."
echo "Runner service: $RUNNER_SERVICE"
echo "Runner directory: $RUNNER_DIR"
echo "Fast-fail IP: $FILTER_IP"
echo "Local logs: $DEST_ROOT"
echo
systemctl --no-pager --full status "$RUNNER_SERVICE" || true

echo
echo "Effective deny rule:"
systemctl show "$RUNNER_SERVICE" -p IPAddressDeny || true

echo
echo "Archive timer:"
systemctl --no-pager --full status webigram-github-runner-local-results.timer || true

echo
echo "If the host is supported by systemd's IPAddressDeny, blocked Blob connections from this runner now fail fast."
