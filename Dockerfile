# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/ci/npm-ci-fallback.sh ./scripts/ci/npm-ci-fallback.sh

RUN apk add --no-cache bash zip

# Manual Docker builds use the same npm fallback order as CI:
# official npm -> Liara -> Chabokan -> IranServer.
RUN --mount=type=cache,target=/root/.npm \
    bash scripts/ci/npm-ci-fallback.sh

COPY . .

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
