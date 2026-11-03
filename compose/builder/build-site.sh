#!/bin/sh
# Build the site once, from its code and the demo content, and write the editor's
# configuration. Saving through to a published page replaces the first part with
# the intake's run.
set -eu

export HOME=/work/home
mkdir -p "$HOME"

# The site's code is read-only and may lack dependencies for this platform: its own
# node_modules stays in the volume, and never comes from a host's.
mkdir -p /work/site
cd /site
tar --exclude=./node_modules --exclude=./dist --exclude=./.astro --exclude=./.git -cf - . | tar -xf - -C /work/site

cd /work/site
# A core pinned by its path has no version to tell npm it has changed.
if grep -q '"@kntnt/konzilo": "file:' package.json; then
	rm -rf node_modules/@kntnt/konzilo package-lock.json
fi
npm install --install-links --no-audit --no-fund --loglevel=error
npm run build --silent

# Replace what is published only once the build has worked.
find /public -mindepth 1 -delete
cp -a dist/. /public/

KONZILO_OAUTH_CLIENT=$(cat /state/oauth-client) node /konzilo/bin/konzilo-cms.js /work/site /admin-config/config.json

touch /tmp/built
exec sleep infinity
