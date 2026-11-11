// What a Compose project is made of, read from its files, so that a slip shows in a
// minute rather than in the acceptance suite: every image is pinned in one place and
// by its digest, every volume says what it holds, and the proxy's list stands.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

const compose = read('compose/compose.yaml');
const versions = read('versions.env');

test('names the images it builds by the site, so that sites on one machine keep their own', () => {
  const built = [...compose.matchAll(/^\s+image: (konzilo-\S+)$/gm)].map(([, reference]) => reference);
  assert.ok(built.length > 0);
  for (const reference of built) assert.match(reference, /^konzilo-(web|builder|typesense):\$\{KONZILO_SITE\}$/, reference);
});

// A test's site removes its images by its name, since nothing else does: every one Compose
// builds, so that no run leaves one behind.
test('removes, in the acceptance suites, every image a site\'s Compose builds', () => {
  const built = [...compose.matchAll(/^\s+image: konzilo-([a-z]+):\$\{KONZILO_SITE\}$/gm)].map(([, kind]) => kind);
  const removed = [...read('acceptance/lib/site.js').matchAll(/`konzilo-([a-z]+):\$\{name\}`/g)].map(([, kind]) => kind);
  assert.deepEqual([...new Set(removed)].sort(), [...new Set(built)].sort());
});

test('names every image by a digest from versions.env, and holds no version of its own', () => {
  for (const [, reference] of compose.matchAll(/^\s+image: (\S+)$/gm)) {
    if (reference.startsWith('konzilo-')) continue;
    assert.match(reference, /@sha256:\$\{[A-Z_]+_DIGEST\}$/, reference);
  }
  assert.doesNotMatch(compose, /sha256:[0-9a-f]{8}/);
  for (const [, key] of compose.matchAll(/\$\{([A-Z_]+_DIGEST|FORGEJO|CADDY|NODE_RELEASE|TYPESENSE)\}/g)) {
    assert.match(versions, new RegExp(`^${key}=`, 'm'), key);
  }
  for (const dockerfile of ['compose/web/Dockerfile', 'compose/builder/Dockerfile', 'compose/typesense/Dockerfile']) {
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

// Search (ADR 0053, ADR 0005): Typesense in a network of its own, which only the web server and
// what shares its network reach, with no port and no way out, its admin key read from a file the
// seed writes, never from the environment or its command.
test('runs Typesense in a network of its own, with no port and its key in a file', () => {
  const blocks = Object.fromEntries(compose.split(/^ {2}(?=[a-z-]+:\n)/m).slice(1).map((block) => [block.slice(0, block.indexOf(':')), block]));
  const typesense = blocks.typesense;
  assert.ok(typesense, 'a service of its own');
  assert.match(typesense, /^ {4}<<: \*hardened$/m);
  assert.match(typesense, /^ {4}networks: \[search\]$/m);
  assert.doesNotMatch(typesense, /^ {4}ports:/m);
  assert.match(typesense, /"--config", "\/secret\/typesense\.ini"/);
  assert.doesNotMatch(typesense, /TYPESENSE_API_KEY|--api-key/);
  assert.match(blocks.web, /^ {4}networks: \[default, search, visitors\]$/m);
  assert.match(compose, /^ {2}search:\n {4}internal: true$/m);
  for (const [name, block] of Object.entries(blocks)) {
    if (!['web', 'typesense'].includes(name)) assert.doesNotMatch(block, /^ {4}networks:.*search/m, name);
  }
  assert.match(read('compose/typesense/Dockerfile'), /^USER 1000:1000$/m);
});

test('reads the route to search from where the build writes it, and says when Typesense does not answer', () => {
  const caddyfile = read('compose/web/Caddyfile');
  const host = caddyfile.slice(caddyfile.indexOf(':{$KONZILO_PORT_SITE}'), caddyfile.indexOf(':{$KONZILO_PORT_ADMIN}'));
  // A glob, since there is none before the first build.
  assert.match(host, /import \/srv\/search\/search-route\*\.caddy/);
  assert.match(host, /handle_errors \{[\s\S]*@search_down \{\n\t\t\tpath \/_konzilo\/search\n\t\t\texpression `\{err\.status_code\} >= 500`\n\t\t\}/);
  assert.match(host, /respond `\{"message":"Search does not answer\."\}` 502/);
  assert.match(compose, /- search-route:\/srv\/search:ro/);
  assert.match(compose, /- search-route:\/search-route\n/);
});

// Each service's block, by its name, from the services alone, since a network may take a
// service's name.
const servicesOf = (text) => Object.fromEntries(text.slice(text.indexOf('\nservices:\n'), text.indexOf('\nsecrets:\n')).split(/^ {2}(?=[a-z-]+:\n)/m).slice(1).map((block) => [block.slice(0, block.indexOf(':')), block]));
const siteHost = () => {
  const caddyfile = read('compose/web/Caddyfile');
  return caddyfile.slice(caddyfile.indexOf(':{$KONZILO_PORT_SITE}'), caddyfile.indexOf(':{$KONZILO_PORT_ADMIN}'));
};

// The service in its role for visitors (ADR 0044, ADR 0005): a container of its own, locked down
// as every other, in a network with no way out that it shares with the web server alone, and its
// data in a volume of its own.
test('runs the service for visitors in a container of its own, which the web server alone reaches, its data in a volume of its own', () => {
  const blocks = servicesOf(compose);
  const visitors = blocks.visitors;
  assert.ok(visitors, 'a service of its own');
  assert.match(visitors, /^ {4}<<: \*hardened$/m);
  assert.match(visitors, /^ {4}mem_limit: /m);
  assert.match(visitors, /^ {4}networks: \[visitors\]$/m);
  assert.doesNotMatch(visitors, /^ {4}ports:/m);
  assert.match(visitors, /^ {4}command: \["node", "\/konzilo\/bin\/konzilo-service\.js", "visitors"\]$/m);
  assert.match(visitors, /^ {6}- service-data:\/service-data$/m);
  assert.match(visitors, /site-description\.json:\/site\/site-description\.json:ro$/m);
  assert.match(visitors, /KONZILO_SITE_ORIGIN: http:\/\/localhost:\$\{KONZILO_PORT_SITE\}/);
  assert.match(blocks.editors, /^ {4}command: \["node", "\/konzilo\/bin\/konzilo-service\.js", "editors"\]$/m);
  assert.match(compose, /^ {2}visitors:\n {4}internal: true$/m);
  for (const [name, block] of Object.entries(blocks)) {
    if (!['web', 'visitors'].includes(name)) assert.doesNotMatch(block, /^ {4}networks:.*visitors/m, name);
    if (!['visitors', 'editors'].includes(name)) assert.doesNotMatch(block, /service-data:/, name);
  }
  // A volume takes its first owner from the folder it is mounted on.
  assert.match(read('compose/builder/Dockerfile'), /mkdir -p [^\n]*\/service-data\b[^\n]*&& chown node:node [^\n]*\/service-data\b/);
});

// A form's submissions (ADR 0045): the service in its role for editors reads them from the same
// data, and the admin host passes their addresses to it, which asks Forgejo who is asking.
test('lets the service for editors read the forms\' submissions, on the admin host alone', () => {
  const blocks = servicesOf(compose);
  assert.match(blocks.editors, /^ {6}- service-data:\/service-data$/m);
  assert.doesNotMatch(blocks.editors, /^ {4}networks:/m, 'in the site\'s own network, which reaches Forgejo');
  const caddyfile = read('compose/web/Caddyfile');
  const admin = caddyfile.slice(caddyfile.indexOf(':{$KONZILO_PORT_ADMIN}'), caddyfile.indexOf(':{$KONZILO_PORT_PREVIEW}'));
  const matcher = /@service path (.*)$/m.exec(admin)?.[1].split(' ');
  assert.ok(matcher, 'a matcher of its own');
  for (const path of ['/_konzilo/submissions', '/_konzilo/submissions/*']) assert.ok(matcher.includes(path), path);
  assert.match(/handle @service \{\n([\s\S]*?)\n\t\}/.exec(admin)?.[1] ?? '', /reverse_proxy editors:4100 \{/);
});

// What the web server passes on to the service (ADR 0044): the request's method, path, query and
// body with its type, `Origin`, `Referer` and `Sec-Fetch-Site`, the visitor's address and the host
// it came to, and nothing else.
test('passes every path below /_konzilo/ to the service but search and the consent scripts\' files, with what ADR 0044 lists alone', () => {
  const host = siteHost();
  const matcher = /@konzilo_visitors \{\n([\s\S]*?)\n\t\}/.exec(host)?.[1];
  assert.ok(matcher, 'a matcher of its own');
  assert.match(matcher, /^\t\tpath \/_konzilo\/\*$/m);
  assert.match(matcher, /^\t\tnot path \/_konzilo\/search \/_konzilo\/search\/\*$/m);
  assert.match(matcher, /^\t\tnot \{\n\t\t\tpath \/_konzilo\/consent\/\*\n\t\t\tmethod GET HEAD\n\t\t\}$/m);
  const handled = /handle @konzilo_visitors \{\n([\s\S]*?)\n\t\}\n/.exec(host)?.[1];
  assert.ok(handled);
  assert.match(handled, /request_body \{\n\t\t\tmax_size 1MB\n\t\t\}/);
  assert.match(handled, /reverse_proxy visitors:4200 \{/);
  const passed = [...handled.matchAll(/^\t\t\theader_up (\S+)(?: (.*))?$/gm)].map(([, name, value]) => [name, value ?? null]);
  assert.deepEqual(passed, [
    ['-*', null],
    ['Content-Type', '{http.request.header.Content-Type}'],
    ['Origin', '{http.request.header.Origin}'],
    ['Referer', '{http.request.header.Referer}'],
    ['Sec-Fetch-Site', '{http.request.header.Sec-Fetch-Site}'],
    ['X-Konzilo-Client', '{http.request.remote.host}'],
    ['X-Konzilo-Host', '{http.request.hostport}'],
    // Go names itself where a request names no browser, and names none where the name is empty.
    ['User-Agent', '""'],
  ]);
  assert.ok(host.indexOf('handle @konzilo_visitors') < host.indexOf('file_server'), 'before the release\'s files');
});

// While the service does not answer, a form's post gets the release's page that says it was not
// sent (ADR 0045), as the dev server gives it.
test('gives a form the service does not answer the release\'s page that says it was not sent', () => {
  const errors = siteHost().slice(siteHost().indexOf('handle_errors'));
  assert.match(errors, /@form_down \{\n\t\t\tpath \/_konzilo\/forms\/\*\n\t\t\texpression `\{err\.status_code\} >= 500`\n\t\t\}/);
  const handled = /handle @form_down \{\n([\s\S]*?)\n\t\t\}/.exec(errors)?.[1];
  assert.ok(handled);
  assert.match(handled, /method GET/);
  assert.match(handled, /rewrite \* \/_konzilo\/form-not-sent\.html/);
  assert.match(handled, /header Cache-Control no-store/);
  assert.match(handled, /file_server/);
  assert.ok(errors.indexOf('handle @form_down') < errors.lastIndexOf('rewrite * /404.html'), 'before a page not found');
});

// The builder's image installs the core's dependencies alone, with no peer such as Astro, so
// whatever a site's Astro must read runs in the site's own dependencies, as a program of its own
// (the build's Astro and its search documents). Each program the image runs, and all it imports.
test('runs nothing in the builder\'s image that imports a package the image does not install', () => {
  const installed = new Set(Object.keys(JSON.parse(read('package.json')).dependencies));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const programs = ['compose/seed/seed.js', 'bin/konzilo-builder.js', 'bin/konzilo-service.js', 'bin/konzilo-preview.js', 'bin/konzilo-code.js', 'bin/konzilo-intake.js', 'bin/konzilo-cms.js'];
  const seen = new Set();
  const outside = [];
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)) {
      if (!specifier) continue;
      if (specifier.startsWith('.')) {
        const next = resolve(dirname(file), specifier);
        if (next.endsWith('.js') && existsSync(next)) walk(next);
        continue;
      }
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      if (!specifier.startsWith('node:') && !builtinModules.includes(name) && !installed.has(name)) outside.push(`${file.slice(root.length)}: ${specifier}`);
    }
  };
  for (const program of programs) walk(resolve(root, program));
  assert.deepEqual(outside, []);
});
