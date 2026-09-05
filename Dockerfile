# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

# The production runner has occasionally had slow/flaky access to npm from
# Docker build networking. Reuse the npm cache between builds and keep npm
# retries bounded so transient network failures recover without hanging forever.
RUN --mount=type=cache,target=/root/.npm \
    npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000 && \
    npm config set fetch-timeout 120000 && \
    npm ci --no-audit --no-fund --prefer-offline

RUN apk add --no-cache zip

COPY . .

# Cache the stage-3 CC0 mountain photograph into public/images at build time.
# If the upstream source is temporarily unavailable, the component still has a
# built-in mountain fallback and the production build continues.
# The Website Doctor Chrome extension is also packaged into dist/downloads.
RUN node scripts/fetch-mountain-asset.mjs && \
    npm run build && \
    mkdir -p /app/dist/downloads && \
    cd /app/extension/website-doctor && \
    zip -qr /app/dist/downloads/webigram-website-doctor-chrome.zip .

FROM nginx:1.28-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
