// The *Addresses not found* page's part of the service in its role for editors (ADR 0040): the
// addresses visitors asked for in vain, as the log of addresses not found counts them, folded as
// the page asks, most asked first, but those an Admin hid and those a rule holds, the release's
// or one the source's `redirects.json` holds, which an Admin's save of a rule has just written;
// and an address hidden, which goes on being counted. An Admin's alone, as Forgejo says who is
// asking each time. Against a stand-in for Forgejo.

import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { editorsService } from '../src/service/editors.js';
import { LOG_FILE, notFoundLog } from '../src/service/not-found.js';

const NOW = 1793361600;

// Who each credential is, to Forgejo: an Admin in the team `admins`, an Editor, the instance
// administrator, and a reader of the repository who may not write.
const PEOPLE = {
  'token anna': { login: 'anna', is_admin: false, push: true },
  'token erik': { login: 'erik', is_admin: false, push: true },
  'token instance': { login: 'konzilo', is_admin: true, push: true },
  'token rita': { login: 'rita', is_admin: false, push: false },
};
const ADMIN = { authorization: 'token anna' };
const ROLES = 'token roles';
const READER = 'token read-token';

describe('the addresses not found, for Admins', () => {
  let folder;
  let server;
  let origin;
  let log;
  // The source's redirects.json as the stand-in for Forgejo holds it, or null for none, or a
  // status Forgejo answers with instead.
  let redirects;
  let asked;

  const answerOf = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const forgejo = async (url, { headers }) => {
    const { pathname, searchParams } = new URL(url);
    asked.push({ path: pathname, ref: searchParams.get('ref'), authorization: headers.authorization });
    const person = PEOPLE[headers.authorization];
    if (pathname === '/api/v1/user') return person ? answerOf(person) : answerOf({}, 401);
    if (pathname === '/api/v1/repos/org/source') return person ? answerOf({ permissions: { push: person.push } }) : answerOf({}, 401);
    if (pathname === '/api/v1/repos/org/source/raw/redirects.json' && headers.authorization === READER) {
      if (typeof redirects === 'number') return answerOf({}, redirects);
      return redirects === null ? answerOf({}, 404) : answerOf(redirects);
    }
    if (headers.authorization !== ROLES) return answerOf({}, 404);
    if (pathname === '/api/v1/orgs/org/teams') return answerOf([{ id: 7, name: 'admins' }]);
    if (pathname === '/api/v1/teams/7/members') return answerOf([{ login: 'anna' }]);
    throw new Error(`nothing to say of ${pathname}`);
  };

  const askedFor = (path, at = NOW) => appendFileSync(join(log, LOG_FILE), `${JSON.stringify({ ts: at, path })}\n`);
  const read = async (headers = ADMIN) => {
    const answer = await fetch(`${origin}/_konzilo/not-found`, { headers });
    return { status: answer.status, body: await answer.json() };
  };
  const hide = async (address, headers = ADMIN) => {
    const answer = await fetch(`${origin}/_konzilo/not-found/hidden`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ address }) });
    return { status: answer.status, body: await answer.json() };
  };
  const addresses = (body) => body.addresses.map(({ address, count }) => [address, count]);

  beforeEach(async () => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-service-not-found-'));
    log = join(folder, 'log');
    mkdirSync(log);
    mkdirSync(join(folder, 'public/current/pages'), { recursive: true });
    redirects = { rules: [] };
    asked = [];
    const notFound = notFoundLog({ log, counts: join(folder, 'counts/counts.json'), release: join(folder, 'public/current'), now: () => NOW });
    const service = editorsService({ forgejo: 'http://forgejo', repository: 'org/source', token: 'read-token', rolesToken: 'roles', control: buildControl(join(folder, 'control')), notFound, get: forgejo });
    server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((go) => server.close(go));
    rmSync(folder, { recursive: true, force: true });
  });

  test('shows an Admin what visitors asked for in vain, as the page asks, most asked first, with when each was last asked for', async () => {
    for (const [path, times] of [['/once/', 1], ['/most/', 3], ['/some/', 2]]) for (let n = 0; n < times; n++) askedFor(path, NOW - 60);
    const { status, body } = await read();
    assert.equal(status, 200);
    assert.deepEqual(body, {
      addresses: [
        { address: '/most/', count: 3, last: new Date((NOW - 60) * 1000).toISOString() },
        { address: '/some/', count: 2, last: new Date((NOW - 60) * 1000).toISOString() },
        { address: '/once/', count: 1, last: new Date((NOW - 60) * 1000).toISOString() },
      ],
    });
    assert.ok(asked.some(({ path, ref, authorization }) => path === '/api/v1/repos/org/source/raw/redirects.json' && ref === 'main' && authorization === READER));
  });

  test('shows the instance administrator too', async () => {
    askedFor('/once/');
    assert.deepEqual(addresses((await read({ authorization: 'token instance' })).body), [['/once/', 1]]);
  });

  test('leaves out an address a rule in the source holds at once, before any build, in either form the source holds a rule', async () => {
    for (const path of ['/redirected/', '/gone', '/patterned/x', '/left/']) askedFor(path);
    redirects = { rules: [{ from: '/redirected/', to: '/left/', status: 301 }, { from: '/gone', status: 410 }, { pattern: '^/patterned/.*', status: 410 }] };
    assert.deepEqual(addresses((await read()).body), [['/left/', 1]]);
    redirects = [{ from: '/redirected/', to: '/left/', status: '301' }];
    assert.deepEqual(addresses((await read()).body).map(([address]) => address).sort(), ['/gone', '/left/', '/patterned/x']);
  });

  test('shows every address where the source holds no rules, and says it cannot tell where Forgejo cannot be read', async () => {
    askedFor('/once/');
    redirects = null;
    assert.deepEqual(addresses((await read()).body), [['/once/', 1]]);
    redirects = 'not json';
    assert.deepEqual(addresses((await read()).body), [['/once/', 1]]);
    redirects = 500;
    assert.equal((await read()).status, 502);
  });

  test('hides an address an Admin asks it to, which goes on being counted, and leaves the rest', async () => {
    askedFor('/hidden/');
    askedFor('/shown/');
    const { status, body } = await hide('/hidden/');
    assert.equal(status, 200);
    assert.deepEqual(addresses(body), [['/shown/', 1]]);
    askedFor('/hidden/');
    assert.deepEqual(addresses((await read()).body), [['/shown/', 1]]);
    assert.deepEqual(JSON.parse(readFileSync(join(folder, 'counts/counts.json'), 'utf8')).addresses['/hidden/'], { count: 2, last: NOW, hidden: true });
    assert.equal((await hide('/never-asked/')).status, 404);
  });

  test('takes nothing it cannot read as an address to hide', async () => {
    for (const body of ['not json', '{"address":12}', '{}', '[]']) {
      const answer = await fetch(`${origin}/_konzilo/not-found/hidden`, { method: 'POST', headers: { ...ADMIN, 'content-type': 'application/json' }, body });
      assert.equal(answer.status, 400, body);
    }
    const plain = await fetch(`${origin}/_konzilo/not-found/hidden`, { method: 'POST', headers: { ...ADMIN, 'content-type': 'text/plain' }, body: '{"address":"/x/"}' });
    assert.equal(plain.status, 415);
    const large = await fetch(`${origin}/_konzilo/not-found/hidden`, { method: 'POST', headers: { ...ADMIN, 'content-type': 'application/json' }, body: JSON.stringify({ address: `/${'x'.repeat(5000)}/` }) });
    assert.equal(large.status, 413);
  });

  test('is an Admin\'s alone: an Editor is told only that, and whoever may not write nothing', async () => {
    askedFor('/once/');
    await read();
    assert.deepEqual(await read({ authorization: 'token erik' }), { status: 403, body: {} });
    assert.equal((await hide('/once/', { authorization: 'token erik' })).status, 403);
    for (const headers of [{}, { authorization: 'token rita' }, { authorization: 'token nobody' }, { authorization: 'not a credential' }]) {
      assert.deepEqual(await read(headers), { status: 401, body: {} }, JSON.stringify(headers));
      assert.equal((await hide('/once/', headers)).status, 401);
    }
    assert.equal(JSON.parse(readFileSync(join(folder, 'counts/counts.json'), 'utf8')).addresses['/once/'].hidden, undefined);
  });

  test('answers no other method', async () => {
    for (const [path, method] of [['/_konzilo/not-found', 'POST'], ['/_konzilo/not-found', 'DELETE'], ['/_konzilo/not-found/hidden', 'GET']]) {
      const answer = await fetch(`${origin}${path}`, { method, headers: ADMIN });
      assert.equal(answer.status, 405, `${method} ${path}`);
    }
    assert.equal((await fetch(`${origin}/_konzilo/not-found/other`, { headers: ADMIN })).status, 404);
  });
});
