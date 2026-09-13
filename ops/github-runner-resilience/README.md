# GitHub Runner resilience for filtered Azure Results traffic

This setup keeps the official GitHub Actions self-hosted runner and avoids SSH-based deployment.

## Problem

On this server, blocked Azure Blob hosts currently resolve to `10.10.34.35`. The GitHub runner can reach GitHub itself, but Results/step-log uploads to Azure Blob time out. The runner treats Results uploads as best effort, but the Azure SDK waits for its network timeout and retries, which can leave the job stuck at `Complete job` for many minutes.

## Approach

The runner binary is not patched.

Instead, systemd applies `IPAddressDeny=10.10.34.35/32` only to the Webigram runner service. This makes the filtered destination fail immediately inside the runner cgroup instead of silently timing out. The rest of the server is unaffected.

Failed Results uploads are not deleted by the official runner. A timer copies the runner diagnostic logs and `_diag/blocks` to persistent local storage every 30 seconds.

Default local archive:

```text
/var/log/github-actions-local/webigram-ir-wbg-001/
├── diag/
└── results-blocks/
```

Retention is 30 days by default.

## Install

Do not install while a job is actively running. The installer refuses to restart the service when a `Runner.Worker` is active.

```bash
cd /opt/apps/www-webigram.ir
git pull
sudo bash ops/github-runner-resilience/install.sh
```

If the repository is not yet updated locally, fetch `main` first.

Optional overrides:

```bash
sudo env \
  RUNNER_DIR=/opt/github-runners/webigram.ir \
  RUNNER_SERVICE=actions.runner.amdkna-www-webigram.ir.webigram-ir-wbg-001.service \
  FILTER_IP=10.10.34.35 \
  RETENTION_DAYS=30 \
  bash ops/github-runner-resilience/install.sh
```

## Verify

```bash
sudo systemctl show \
  actions.runner.amdkna-www-webigram.ir.webigram-ir-wbg-001.service \
  -p IPAddressDeny

sudo systemctl status \
  actions.runner.amdkna-www-webigram.ir.webigram-ir-wbg-001.service

sudo systemctl status webigram-github-runner-local-results.timer

ls -lah /var/log/github-actions-local/webigram-ir-wbg-001/diag
ls -lah /var/log/github-actions-local/webigram-ir-wbg-001/results-blocks
```

The runner should show `Listening for Jobs` in its journal.

## What is lost when Azure Results is unavailable

GitHub's web UI may have incomplete or missing step logs, summaries, Results-based diagnostics, artifacts, or cache operations that require the inaccessible Results/Blob path. The deployment commands themselves still run on the self-hosted runner.

The local archive preserves runner diagnostic logs and failed Results block files for server-side troubleshooting.

## Roll back

```bash
cd /opt/apps/www-webigram.ir
sudo bash ops/github-runner-resilience/remove.sh
```

Logs are kept by default. To remove them too:

```bash
sudo env KEEP_LOGS=0 bash ops/github-runner-resilience/remove.sh
```

## Important

This setup deliberately targets only the current filtering sink IP, `10.10.34.35`. If the filtering system starts returning another sink address, update `FILTER_IP` and reinstall. Do not block all private address ranges because deploy jobs may legitimately need local/private services.
