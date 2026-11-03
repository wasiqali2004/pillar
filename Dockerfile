# Pillar on one server with one persistent disk at /data.
FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PILLAR_DATA_DIR=/data HOME=/home/node
COPY --chown=node:node --from=build /app ./
EXPOSE 8080
# The disk is mounted owned by root, so it's handed over at start; the app itself
# then runs as an unprivileged user.
CMD ["sh", "-c", "mkdir -p /data && chown -R node:node /data && exec setpriv --reuid=node --regid=node --init-groups node_modules/.bin/next start -p 8080"]
