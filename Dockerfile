# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build

WORKDIR /app

COPY package.json ./

# The production runner has occasionally had slow/flaky access to npm from
# Docker build networking. Reuse the npm cache between builds and keep npm
# retries bounded so transient network failures recover without hanging forever.
RUN --mount=type=cache,target=/root/.npm \
    npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000 && \
    npm config set fetch-timeout 120000 && \
    npm install --no-audit --no-fund --prefer-offline

COPY . .
RUN npm run build

FROM nginx:1.28-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
