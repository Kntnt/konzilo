#!/bin/sh
# Make Forgejo's database and the instance's administrator, once, before Forgejo
# first starts. It runs inside Forgejo's own image, since only its command can make
# the first account. The account still has to set up a second factor (the seed).
set -eu

# Forgejo's setup must be able to write in its custom folder, so the core's templates
# are copied in rather than mounted, and a raise of the core reaches them.
mkdir -p /var/lib/gitea/custom/templates
cp -R /konzilo/templates/. /var/lib/gitea/custom/templates/

forgejo migrate >/dev/null
if ! forgejo admin user list --admin | awk '{print $2}' | grep -qx konzilo; then
	forgejo admin user create --admin --username konzilo --email konzilo@localhost.invalid \
		--password "$(cat /run/secrets/instance-password)" --must-change-password=false
fi
