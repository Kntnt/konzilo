#!/bin/sh
# Build the site once, from its code and the demo content, and write the editor's
# configuration. Saving through to a published page replaces the first part with
# the intake's run.
set -eu

sh /konzilo/compose/builder/prepare-site.sh

export HOME=/work/home
cd /work/site
npm run build --silent

# Replace what is published only once the build has worked.
find /public -mindepth 1 -delete
cp -a dist/. /public/

KONZILO_OAUTH_CLIENT=$(cat /state/oauth-client) node /konzilo/bin/konzilo-cms.js /work/site /admin-config/config.json

touch /tmp/built
exec sleep infinity
