# The builder: Node, Git, Git LFS and the core, for the seed, a site's build, the live
# preview and the service.

ARG NODE
ARG NODE_DIGEST

FROM node:${NODE}-bookworm-slim@sha256:${NODE_DIGEST}
RUN apt-get update -qq \
	&& apt-get install -qq --no-install-recommends git git-lfs ca-certificates >/dev/null \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /konzilo
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=peer --no-audit --no-fund
COPY bin bin
COPY src src
COPY site-template/demo-content site-template/demo-content
COPY compose/seed compose/seed
COPY compose/builder/prepare-site.sh compose/builder/prepare-site.sh
# A volume takes its first owner from the folder it is mounted on.
RUN mkdir -p /state /work /public /admin-config /control /thumbnails /preview-secret /builder-secret /editors-secret /secret && chown node:node /state /work /public /admin-config /control /thumbnails /preview-secret /builder-secret /editors-secret /secret
USER node
