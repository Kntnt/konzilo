# The web server: Caddy with no file capability, so that it runs with every
# capability dropped (ADR 0005), and the editor's static files.

ARG NODE
ARG NODE_DIGEST
ARG CADDY
ARG CADDY_DIGEST

FROM node:${NODE}-bookworm-slim@sha256:${NODE_DIGEST} AS editor
WORKDIR /core
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY scripts/build-editor.js scripts/wasm-reader.js scripts/
COPY src/cms src/cms
COPY src/format src/format
COPY src/texts.js src/
COPY src/astro/reader-features.js src/astro/
COPY src/intake/words.js src/intake/
RUN node scripts/build-editor.js /editor

FROM caddy:${CADDY}-alpine@sha256:${CADDY_DIGEST}
RUN setcap -r /usr/bin/caddy
COPY compose/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=editor /editor /srv/admin
USER 1000:1000
