#!/bin/sh
# The site's code in a folder of this container's own, with its dependencies. The site's
# folder is read-only and may lack dependencies for this platform: its node_modules stays in
# the volume, and never comes from a host's. What is given here is left out too.
set -eu

export HOME=/work/home
mkdir -p "$HOME" /work/site

cd /site
tar --exclude=./node_modules --exclude=./dist --exclude=./.astro --exclude=./.git \
	--exclude=./local-secrets --exclude=./.env "$@" -cf - . | tar -xf - -C /work/site

cd /work/site
# A core pinned by its path has no version to tell npm it has changed.
if grep -q '"@kntnt/konzilo": "file:' package.json; then
	rm -rf node_modules/@kntnt/konzilo package-lock.json
fi
npm install --install-links --no-audit --no-fund --loglevel=error
