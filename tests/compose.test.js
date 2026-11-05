// What a Compose project is made of, read from its files, so that a slip shows in a
// minute rather than in the acceptance suite: every image is pinned in one place and
// by its digest, every volume says what it holds, and the proxy's list stands.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

const compose = read('compose/compose.yaml');
const versions = read('versions.env');

test('names the images it builds by the site, so that sites on one machine keep their own', () => {
  const built = [...compose.matchAll(/^\s+image: (konzilo-\S+)$/gm)].map(([, reference]) => reference);
  assert.ok(built.length > 0);
  for (const reference of built) assert.match(reference, /^konzilo-(web|builder):\$\{KONZILO_SITE\}$/, reference);
});

test('names every image by a digest from versions.env, and holds no version of its own', () => {
  for (const [, reference] of compose.matchAll(/^\s+image: (\S+)$/gm)) {
    if (reference.startsWith('konzilo-')) continue;
    assert.match(reference, /@sha256:\$\{[A-Z_]+_DIGEST\}$/, reference);
  }
  assert.doesNotMatch(compose, /sha256:[0-9a-f]{8}/);
  for (const [, key] of compose.matchAll(/\$\{([A-Z_]+_DIGEST|FORGEJO|CADDY|NODE_RELEASE)\}/g)) {
    assert.match(versions, new RegExp(`^${key}=`, 'm'), key);
  }
  for (const dockerfile of ['compose/web/Dockerfile', 'compose/builder/Dockerfile']) {
    for (const [, from] of read(dockerfile).matchAll(/^FROM (\S+)/gm)) {
      assert.match(from, /@sha256:\$\{[A-Z_]+_DIGEST\}$/, `${dockerfile}: ${from}`);
    }
  }
});

test('a digest in versions.env is a whole one', () => {
  for (const [, key, value] of versions.matchAll(/^([A-Z_]+_DIGEST)=(.*)$/gm)) {
    assert.match(value, /^[0-9a-f]{64}$/, key);
  }
});

test('says what every volume holds, and lists none that is gone', () => {
  const declared = compose.slice(compose.indexOf('\nvolumes:\n')).split('\n').slice(2)
    .map((line) => /^ {2}([a-z-]+):/.exec(line)?.[1])
    .filter(Boolean);
  assert.ok(declared.length > 0);
  const readme = read('compose/README.md');
  const listed = [...readme.matchAll(/^\| `([a-z-]+)` \|/gm)].map((match) => match[1]);
  assert.deepEqual([...listed].sort(), [...declared].sort());
});

test('publishes ports on the web server alone, and on this machine alone', () => {
  const blocks = compose.split(/^ {2}(?=[a-z-]+:\n)/m);
  const withPorts = blocks.filter((block) => /^ {4}ports:/m.test(block));
  assert.equal(withPorts.length, 1);
  assert.match(withPorts[0], /^web:/);
  const ports = /^ {4}ports:\n((?: {6}- .*\n)+)/m.exec(withPorts[0])[1].trim().split('\n');
  assert.equal(ports.length, 4);
  for (const port of ports) assert.match(port, /- 127\.0\.0\.1:/);
});

test('mounts Docker\'s socket nowhere', () => {
  assert.doesNotMatch(compose, /docker\.sock/);
});

test('refuses making tokens and keys before anything else reaches Forgejo', () => {
  const caddyfile = read('compose/web/Caddyfile');
  const host = caddyfile.slice(caddyfile.indexOf(':{$KONZILO_PORT_GIT}'));
  assert.ok(host.indexOf('handle @refused') < host.indexOf('handle @open'), 'first, since handles run in order');
  assert.match(host, /@refused path_regexp \(\?i\)\^\/api\/v1\/\(users\/\[\^\/\]\+\/tokens\|user\/applications\|user\/keys\|user\/gpg_keys\)/);
  assert.match(host, /header_up -X-Real-IP/);
  assert.equal((host.match(/reverse_proxy/g) ?? []).length, (host.match(/header_up -X-Real-IP/g) ?? []).length);
});

test('reads a release\'s rules from beside its pages, where no visitor reaches them', () => {
  const caddyfile = read('compose/web/Caddyfile');
  const host = caddyfile.slice(caddyfile.indexOf(':{$KONZILO_PORT_SITE}'), caddyfile.indexOf(':{$KONZILO_PORT_ADMIN}'));
  assert.match(host, /root \* \/srv\/site\/current\/pages/);
  // A glob, since a file named outright that is not there stops the server before the first build.
  assert.match(host, /import \/srv\/site\/current\/web-rules\*\.caddy/);
  assert.match(compose, /"--watch"/);
});

test('keeps Forgejo\'s settings closed', () => {
  for (const [key, value] of [
    ['service__DISABLE_REGISTRATION', '"true"'],
    ['service__REQUIRE_SIGNIN_VIEW', '"true"'],
    ['service.explore__DISABLE_USERS_PAGE', '"true"'],
    ['security__GLOBAL_TWO_FACTOR_REQUIREMENT', 'all'],
    ['security__LOGIN_REMEMBER_DAYS', '"0"'],
    ['server__DISABLE_SSH', '"true"'],
  ]) {
    assert.ok(compose.includes(`FORGEJO__${key}: ${value}`), key);
  }
});
