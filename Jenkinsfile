pipeline {
    agent none

    options {
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '30'))
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        skipDefaultCheckout(true)
    }

    stages {
        stage('Validate Branch') {
            agent { label 'build-docker-01' }
            steps {
                script {
                    if (env.BRANCH_NAME != 'main') {
                        error("This Jenkins pipeline deploys only the main branch. Current branch: ${env.BRANCH_NAME}")
                    }
                }
            }
        }

        stage('Checkout') {
            agent { label 'build-docker-01' }
            steps {
                checkout scm
                sh '''
                    set -eux
                    echo "Branch: ${BRANCH_NAME}"
                    echo "Commit: $(git rev-parse HEAD)"
                '''
            }
        }

        stage('CI Checks') {
            agent { label 'build-docker-01' }
            steps {
                checkout scm
                sh '''#!/usr/bin/env bash
                    set -Eeuo pipefail

                    node --version
                    npm --version
                    docker compose version

                    bash scripts/ci/early-checks.sh
                    bash scripts/ci/npm-ci-fallback.sh
                    npm run check

                    tmp_dir="$(mktemp -d)"
                    cleanup() {
                      for pid in ${api_pids:-}; do
                        kill "$pid" >/dev/null 2>&1 || true
                      done
                      rm -rf "$tmp_dir"
                    }
                    trap cleanup EXIT

                    PORT=8787 node server/website-doctor-api.mjs >"$tmp_dir/website-doctor.log" 2>&1 &
                    api_pids="$!"
                    PORT=8789 node server/wordpress-doctor-api.mjs >"$tmp_dir/wordpress-doctor.log" 2>&1 &
                    api_pids="$api_pids $!"
                    PORT=8788 node server/brand-checker-api.mjs >"$tmp_dir/brand-checker.log" 2>&1 &
                    api_pids="$api_pids $!"

                    for endpoint in                       http://127.0.0.1:8787/healthz                       http://127.0.0.1:8789/healthz                       http://127.0.0.1:8788/healthz
                    do
                      ready=0
                      for _ in $(seq 1 20); do
                        if curl -fsS --connect-timeout 1 --max-time 2 "$endpoint" >/dev/null; then
                          ready=1
                          break
                        fi
                        sleep 0.25
                      done
                      if [ "$ready" -ne 1 ]; then
                        echo "API smoke check failed: $endpoint" >&2
                        cat "$tmp_dir"/*.log || true
                        exit 1
                      fi
                    done

                    bash scripts/ci/build-site.sh
                    bash scripts/ci/verify-dist.sh
                '''
                stash name: 'webigram-dist', includes: 'dist/**', useDefaultExcludes: false
            }
        }

        stage('Deploy Main') {
            when {
                branch 'main'
            }
            agent { label 'deploy-wbg001' }
            steps {
                checkout scm
                unstash 'webigram-dist'
                sh '''#!/usr/bin/env bash
                    set -Eeuo pipefail

                    APP_DIR=/opt/apps/www-webigram.ir
                    RELEASE_DIR="$WORKSPACE/dist"
                    PUBLIC_HEALTH_URL=https://webigram.ir/healthz
                    EDGE_CONTAINER=edge-nginx

                    export APP_DIR RELEASE_DIR PUBLIC_HEALTH_URL EDGE_CONTAINER
                    CURRENT_SHA="$(git rev-parse HEAD)"
                    export CURRENT_SHA
                    export GITHUB_SHA="$CURRENT_SHA"

                    # Production checkout is bind-mounted into the Jenkins deploy agent
                    # and is owned by a different host user. Trust only this application
                    # directory for Git commands executed by this deployment process.
                    export GIT_CONFIG_COUNT=1
                    export GIT_CONFIG_KEY_0=safe.directory
                    export GIT_CONFIG_VALUE_0="$APP_DIR"
                    export GITHUB_RUN_ID="$BUILD_NUMBER"
                    export GITHUB_RUN_ATTEMPT=1

                    before_sha=""
                    if [ -s "$APP_DIR/.last-successful-deploy" ]; then
                      before_sha="$(tr -d '\r\n' < "$APP_DIR/.last-successful-deploy")"
                    fi

                    if [ -n "$before_sha" ] && ! git cat-file -e "$before_sha^{commit}" 2>/dev/null; then
                      git fetch --no-tags origin "$before_sha" || before_sha=""
                    fi

                    change_file="$(mktemp)"
                    trap 'rm -f "$change_file"' EXIT
                    bash scripts/deploy/classify-changes.sh "$before_sha" "$CURRENT_SHA" jenkins "$change_file"
                    cat "$change_file"
                    # shellcheck disable=SC1090
                    source "$change_file"

                    export SITE_CHANGED="$site_changed"
                    export SERVER_CHANGED="$server_changed"
                    export DIRECTUS_CHANGED="$directus_changed"
                    export COMPOSE_CHANGED="$compose_changed"
                    export NGINX_CHANGED="$nginx_changed"

                    bash scripts/deploy/sync-release.sh

                    if ! (
                      cd "$APP_DIR"
                      timeout 180s bash scripts/deploy/apply-runtime.sh
                      timeout --signal=TERM --kill-after=5s 180s bash scripts/deploy/verify-release.sh
                    ); then
                      echo "Deployment failed; attempting rollback." >&2
                      timeout --signal=TERM --kill-after=5s 90s bash "$APP_DIR/scripts/deploy/rollback-release.sh" || true
                      exit 1
                    fi

                    printf '%s\n' "$CURRENT_SHA" > "$APP_DIR/.last-successful-deploy"
                    echo "Successful production revision: $CURRENT_SHA"
                '''
            }
        }
    }

    post {
        success {
            echo 'CI passed and main was deployed to Webigram production successfully.'
        }
        failure {
            echo 'CI/deployment failed. Check the failing stage; rollback is attempted after production mutation.'
        }
    }
}
