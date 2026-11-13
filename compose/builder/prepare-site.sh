#!/bin/sh
# The site's code, from the folder this runs in, in a folder of this container's own, with its
# dependencies. The site's folder is read-only and may lack dependencies for this platform: its
# node_modules stays in the volume, and never comes from a host's. What is given here is left
# out too. The code is copied at every start, so that a change to it reaches the program, but
# the dependencies are installed only when what they are installed from has changed since the
# last install that ended (installed-from.js), so that a start with nothing changed runs no npm
# and needs no network. The record of that is node_modules/.konzilo-installed-from in the copy,
# written once an install has ended and removed before one begins, so that an install that
# fails or is stopped leaves none and the next start installs again.
#
#   prepare-site.sh <the program's work folder> [what tar leaves out, such as --exclude=./content]
set -eu

work=$1
shift
here=$(cd "$(dirname "$0")" && pwd)
export HOME="$work/home"
mkdir -p "$HOME" "$work/site"

from=$(node "$here/installed-from.js" .)
tar --exclude=./node_modules --exclude=./dist --exclude=./.astro --exclude=./.git \
	--exclude=./local-secrets --exclude=./.env "$@" -cf - . | tar -xf - -C "$work/site"

cd "$work/site"
record=node_modules/.konzilo-installed-from
if [ -f "$record" ] && [ "$(cat "$record")" = "$from" ]; then
	exit 0
fi
rm -f "$record"
# A core pinned by a checkout's path has no version to tell npm it has changed, so it goes with
# the lock. One pinned by a tarball, a release's package in the site's vendor/, is named by its
# version, and is installed from the lock, whose integrity holds its bytes.
pin=$(sed -n 's/^.*"@kntnt\/konzilo" *: *"file:\([^"]*\)".*$/\1/p' package.json | head -n 1)
if [ -n "$pin" ] && [ -d "$pin" ]; then
	rm -rf node_modules/@kntnt/konzilo package-lock.json
fi
npm install --install-links --no-audit --no-fund --loglevel=error
mkdir -p node_modules
printf '%s\n' "$from" >"$record.new"
mv "$record.new" "$record"
