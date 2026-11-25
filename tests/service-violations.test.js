// The Content Security Policy's violation reports (ADR 0051), taken by the service in its role for
// visitors at /_konzilo/violations, as the web server passes them on (ADR 0044), and kept as counts
// of page, directive and what was blocked, with nothing of the visitor, read back as the Admin's
// *Policy violations* page reads them. That the counts go 30 days after they were last seen is
// proved below, by the duty; the page itself in service-editors' terms in its own describe, and the
// whole in real browsers in the acceptance suite's violations.test.js.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { editorsService } from '../src/service/editors.js';
import { openStore } from '../src/service/store.js';
import { VIOLATION_REPORTS } from '../src/astro/content-security-policy.js';
import { violationCounts, violationsDuty, VIOLATIONS_PATH } from '../src/service/violations.js';
import { visitorsService } from '../src/service/visitors.js';
import { siteDescription } from '../src/site-description.js';

const HOST = 'www.example.com';
const SITE = `https://${HOST}`;
const PATH = '/_konzilo/violations';

// A report as Firefox sends one, to the policy's `report-uri`.
const cspReport = ({ page = `${SITE}/articles/one/?utm_source=mail#top`, directive = 'img-src', blocked = 'https://tracker.example/pixel.gif?id=7', source = `${SITE}/articles/one/` } = {}) => ({
  'csp-report': {
    'blocked-uri': blocked,
    'column-number': 12,
    disposition: 'enforce',
    'document-uri': page,
    'effective-directive': directive,
    'original-policy': "default-src 'self'; img-src 'self' data:; report-uri /_konzilo/violations; report-to violations",
    referrer: 'https://search.example/?q=one',
    'script-sample': '',
    'source-file': source,
    'status-code': 200,
    'violated-directive': directive,
  },
});

// A report as Chromium sends one, by the Reporting API, to the group the policy's `report-to` names.
const apiReport = ({ page = `${SITE}/articles/one/?utm_source=mail`, directive = 'img-src', blocked = 'https://tracker.example/pixel.gif?id=7', source = `${SITE}/articles/one/`, type = 'csp-violation' } = {}) => ({
  age: 2,
  body: {
    blockedURL: blocked,
    columnNumber: 12,
    disposition: 'enforce',
    documentURL: page,
    effectiveDirective: directive,
    lineNumber: 1,
    originalPolicy: "default-src 'self'; img-src 'self' data:; report-uri /_konzilo/violations; report-to violations",
    referrer: 'https://search.example/?q=one',
    sample: '',
    sourceFile: source,
    statusCode: 200,
  },
  type,
  url: page,
  user_agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});

const CSP_REPORT = 'application/csp-report';
const REPORTS_JSON = 'application/reports+json';

// A request as the web server passes it on (ADR 0044). Gives { status, headers, body }.
function send(origin, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const asked = request(new URL(path, origin), { method, headers, agent: false }, (answer) => {
      const chunks = [];
      answer.on('data', (chunk) => chunks.push(chunk));
      answer.on('end', () => resolve({ status: answer.statusCode, headers: answer.headers, body: Buffer.concat(chunks).toString() }));
    });
    asked.on('error', reject);
    asked.end(body);
  });
}

// Each release's policy sends its reports where the service takes them, as `report-uri` and as the
// group `report-to` names (content-security-policy.test.js).
test('takes the reports at the address each release\'s policy sends them to', () => {
  assert.equal(VIOLATIONS_PATH, VIOLATION_REPORTS);
  assert.equal(PATH, VIOLATIONS_PATH);
});

describe('the policy\'s violation reports, for visitors', () => {
  let folder;
  let store;
  let server;
  let origin;
  let clock;

  const later = (seconds) => {
    clock = new Date(clock.getTime() + seconds * 1000);
  };

  // What a browser on a page of the site sends with a report, and the web server's own headers,
  // from the visitor at `address`.
  const fromThePage = (address = '192.0.2.7') => ({ 'Sec-Fetch-Site': 'same-origin', Origin: SITE, 'X-Konzilo-Client': address, 'X-Konzilo-Host': HOST });
  const report = (type, given, headers = fromThePage()) => send(origin, 'POST', PATH, { headers: { ...headers, 'Content-Type': type }, body: typeof given === 'string' ? given : JSON.stringify(given) });

  // The counts as the Admin's page reads them.
  const counted = () => violationCounts(store).shown();

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-violations-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  beforeEach(async () => {
    rmSync(join(folder, 'service.sqlite'), { force: true });
    clock = new Date('2026-11-25T10:00:00Z');
    store = openStore(join(folder, 'service.sqlite'));
    const site = siteDescription({ language: 'en_GB', types: { note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/{slug}/', elements: ['paragraph'], fields: {} } } });
    const service = visitorsService({ site: () => site, store, hosts: [HOST], now: () => clock });
    server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((go) => server.close(go));
    store.close();
  });

  describe('a report in either format', () => {
    test('is counted by the page\'s path without its query, the effective directive and the origin blocked, and answered with nothing', async () => {
      const answer = await report(CSP_REPORT, cspReport());
      assert.equal(answer.status, 204);
      assert.equal(answer.body, '');
      assert.equal(answer.headers['cache-control'], 'no-store');
      assert.equal(answer.headers['set-cookie'], undefined);
      later(60);
      assert.equal((await report(REPORTS_JSON, [apiReport()])).status, 204);
      assert.deepEqual(counted().violations, [
        { page: '/articles/one/', directive: 'img-src', blocked: 'https://tracker.example', count: 2, lastSeen: '2026-11-25T10:01:00.000Z' },
      ]);
    });

    test('keeps of what was blocked the origin, the scheme alone, or inline or eval, and counts nothing a browser extension caused', async () => {
      const blocked = [
        ['script-src-elem', 'https://cdn.example:8443/tag.js'],
        ['connect-src', 'wss://live.example/socket'],
        ['img-src', 'data'],
        ['img-src', 'data:image/png;base64,iVBORw0KGgo='],
        ['worker-src', 'blob:https://www.example.com/7f3c'],
        ['script-src-elem', 'inline'],
        ['style-src-attr', 'inline'],
        ['script-src', 'eval'],
        ['script-src', 'wasm-eval'],
      ];
      for (const [directive, uri] of blocked) assert.equal((await report(CSP_REPORT, cspReport({ directive, blocked: uri }))).status, 204);
      // What an extension's own code asked for, or wrote into the page.
      await report(CSP_REPORT, cspReport({ blocked: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/icon.png' }));
      await report(REPORTS_JSON, [
        apiReport({ blocked: 'moz-extension', directive: 'script-src-elem' }),
        apiReport({ blocked: 'safari-web-extension://5D2A0B3E/inject.js', directive: 'script-src-elem' }),
        apiReport({ blocked: 'inline', directive: 'style-src-elem', source: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/content.js' }),
      ]);
      const shown = counted().violations.map(({ directive, blocked: what, count }) => `${directive} ${what} ${count}`).sort();
      assert.deepEqual(shown, [
        'connect-src wss://live.example 1',
        'img-src data: 2',
        'script-src eval 2',
        'script-src-elem https://cdn.example:8443 1',
        'script-src-elem inline 1',
        'style-src-attr inline 1',
        'worker-src blob: 1',
      ]);
    });

    test('keeps at most 300 characters of a path, and counts no report of a directive no policy has, of no page, or of nothing it can tell', async () => {
      const long = `/${'a'.repeat(400)}/`;
      await report(REPORTS_JSON, [
        apiReport({ page: `${SITE}${long}?q=1` }),
        apiReport({ directive: 'IMG-SRC' }),
        apiReport({ directive: 'made-up-src' }),
        apiReport({ directive: 42 }),
        apiReport({ page: 'not an address' }),
        apiReport({ page: 'about:blank' }),
        apiReport({ blocked: '' }),
        apiReport({ blocked: 'self' }),
        apiReport({ type: 'deprecation' }),
        { type: 'csp-violation' },
        'not a report',
      ]);
      assert.deepEqual(counted().violations.map(({ page, directive, count }) => [page, directive, count]), [
        [long.slice(0, 300), 'img-src', 1],
        ['/articles/one/', 'img-src', 1],
      ]);
    });
  });

  describe('what is refused', () => {
    test('a report sent from a page that is not the site\'s own, by what the browser says, is refused and not counted', async () => {
      for (const headers of [
        { ...fromThePage(), 'Sec-Fetch-Site': 'cross-site', Origin: 'https://elsewhere.example' },
        { ...fromThePage(), 'Sec-Fetch-Site': 'same-site' },
        { 'X-Konzilo-Client': '192.0.2.7', 'X-Konzilo-Host': HOST, Origin: 'https://elsewhere.example' },
        { 'X-Konzilo-Client': '192.0.2.7', 'X-Konzilo-Host': HOST },
      ]) {
        assert.equal((await report(CSP_REPORT, cspReport(), headers)).status, 403, JSON.stringify(headers));
      }
      assert.deepEqual(counted().violations, []);
    });

    test('a browser that says nothing of where it is is taken by its Origin, or else its Referer, on the host it reached or a public host of the site\'s', async () => {
      assert.equal((await report(REPORTS_JSON, [apiReport()], { 'X-Konzilo-Client': '192.0.2.7', 'X-Konzilo-Host': 'localhost:4321', Origin: SITE })).status, 204);
      assert.equal((await report(CSP_REPORT, cspReport(), { 'X-Konzilo-Client': '192.0.2.7', 'X-Konzilo-Host': HOST, Referer: `${SITE}/articles/one/` })).status, 204);
      assert.equal(counted().violations[0].count, 2);
    });

    test('a report of a page on another host is not counted, beside one of the site\'s own', async () => {
      assert.equal((await report(REPORTS_JSON, [apiReport({ page: 'https://elsewhere.example/articles/one/' }), apiReport({ page: `${SITE}/two/` })])).status, 204);
      assert.deepEqual(counted().violations.map(({ page }) => page), ['/two/']);
    });

    test('a body that is no report, more than 100 reports, a body over 128 KiB, another type and another method are refused, and nothing is counted', async () => {
      assert.equal((await report(CSP_REPORT, 'not JSON')).status, 400);
      assert.equal((await report(CSP_REPORT, [cspReport()])).status, 400);
      assert.equal((await report(REPORTS_JSON, apiReport())).status, 400);
      assert.equal((await report(REPORTS_JSON, Array.from({ length: 101 }, () => apiReport()))).status, 413);
      const large = [apiReport({ blocked: `https://tracker.example/${'x'.repeat(128 * 1024)}` })];
      assert.equal((await report(REPORTS_JSON, large)).status, 413);
      assert.equal((await report('application/json', [apiReport()])).status, 415);
      assert.equal((await send(origin, 'GET', PATH, { headers: fromThePage() })).status, 405);
      assert.equal((await send(origin, 'POST', `${PATH}/more`, { headers: { ...fromThePage(), 'Content-Type': REPORTS_JSON }, body: JSON.stringify([apiReport()]) })).status, 404);
      assert.deepEqual(counted().violations, []);
      assert.equal((await report(REPORTS_JSON, Array.from({ length: 100 }, () => apiReport()))).status, 204);
      assert.equal(counted().violations[0].count, 100);
    });
  });

  describe('what is kept', () => {
    test('holds nothing of the visitor\'s address, browser or referrer, nor the page\'s query, the address blocked or the policy, and stays across a restart', async () => {
      await report(CSP_REPORT, cspReport());
      await report(REPORTS_JSON, [apiReport({ directive: 'script-src-elem', blocked: 'https://cdn.example/tag.js?visitor=4711' })]);
      store.close();
      store = openStore(join(folder, 'service.sqlite'));
      assert.equal(counted().violations.length, 2);
      for (const held of [join(folder, 'service.sqlite'), join(folder, 'service.sqlite-wal')]) {
        if (!existsSync(held)) continue;
        const bytes = readFileSync(held);
        for (const word of ['192.0.2.7', 'Mozilla', 'search.example', 'utm_source', 'pixel.gif', 'visitor=4711', 'tag.js', "default-src 'self'"]) assert.ok(!bytes.includes(word), `${word} in ${held}`);
      }
    });
  });

  describe('too many', () => {
    test('counts 100 reports of one client in a window of ten minutes, refuses the rest until the window ends, saying when, and counts another client\'s meanwhile', async () => {
      clock = new Date('2026-11-25T10:02:30Z');
      assert.equal((await report(REPORTS_JSON, Array.from({ length: 60 }, () => apiReport()))).status, 204);
      assert.equal((await report(REPORTS_JSON, Array.from({ length: 60 }, () => apiReport()))).status, 204, 'the first 40 of these counted');
      assert.equal(counted().violations[0].count, 100);
      const refused = await report(CSP_REPORT, cspReport());
      assert.equal(refused.status, 429);
      assert.equal(refused.headers['retry-after'], '450');
      assert.equal((await report(CSP_REPORT, cspReport(), fromThePage('198.51.100.4'))).status, 204);
      assert.equal(counted().violations[0].count, 101);
      clock = new Date('2026-11-25T10:10:00Z');
      assert.equal((await report(CSP_REPORT, cspReport())).status, 204, 'a new window');
      assert.equal(counted().violations[0].count, 102);
    });
  });

  describe('past 1,000 entries', () => {
    test('counts a new combination into one entry for the rest, and goes on counting those it has', async () => {
      for (let client = 0; client < 10; client += 1) {
        const reports = Array.from({ length: 100 }, (_, at) => apiReport({ page: `${SITE}/page-${client * 100 + at}/` }));
        assert.equal((await report(REPORTS_JSON, reports, fromThePage(`192.0.2.${client}`))).status, 204);
      }
      later(60);
      assert.equal((await report(REPORTS_JSON, [apiReport({ page: `${SITE}/page-0/` }), apiReport({ page: `${SITE}/new/` }), apiReport({ directive: 'script-src-elem', blocked: 'inline' })], fromThePage('192.0.2.200'))).status, 204);
      later(60);
      assert.equal((await report(REPORTS_JSON, [apiReport({ page: `${SITE}/newer/` })], fromThePage('192.0.2.201'))).status, 204);
      const { violations, rest } = counted();
      assert.equal(violations.length, 1000);
      assert.deepEqual(violations[0], { page: '/page-0/', directive: 'img-src', blocked: 'https://tracker.example', count: 2, lastSeen: '2026-11-25T10:01:00.000Z' });
      assert.deepEqual(rest, { count: 3, lastSeen: '2026-11-25T10:02:00.000Z' });
    });

    test('is no entry for the rest while there is room', async () => {
      await report(CSP_REPORT, cspReport());
      assert.equal(counted().rest, null);
    });
  });
});

// An entry goes 30 days after it was last seen (ADR 0051), by the service's timed duty in its role
// for editors (ADR 0044), at its start and each minute, overwritten where it stood.
describe('the policy\'s violations kept for 30 days after each was last seen', () => {
  let folder;
  let file;
  let store;
  let clock;

  const seen = (at, page, { directive = 'img-src', blocked = 'https://tracker.example' } = {}) => violationCounts(store).count([{ page, directive, blocked }], new Date(at));
  const duty = () => violationsDuty({ store, now: () => clock });
  const pages = () => violationCounts(store).shown().violations.map(({ page }) => page);

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-violations-kept-'));
    file = join(folder, 'service.sqlite');
  });
  after(() => rmSync(folder, { recursive: true, force: true }));
  beforeEach(() => {
    rmSync(file, { force: true });
    store = openStore(file);
    clock = new Date('2026-12-31T12:00:00Z');
  });
  afterEach(() => store.close());

  test('forgets an entry last seen more than 30 days ago, the one for the rest among them, and keeps the rest, also once seen again', () => {
    seen('2026-11-20T12:00:00Z', '/seen-again/');
    seen('2026-12-01T11:59:59Z', '/thirty-days-and-a-second/');
    seen('2026-12-01T12:00:01Z', '/a-second-under-thirty-days/');
    seen('2026-12-30T12:00:00Z', '/seen-again/');
    seen('2026-11-30T12:00:00Z', '', { directive: '', blocked: '' });
    assert.equal(duty().run(), 2);
    assert.deepEqual(pages(), ['/seen-again/', '/a-second-under-thirty-days/']);
    assert.equal(violationCounts(store).shown().rest, null);
  });

  // The service's data goes into backups and the archive (ADR 0006), which must not carry what
  // was forgotten in the free space of the database's pages, or in its log of writes.
  test('leaves nothing of what it forgets in the service\'s data files', () => {
    const PAGE = '/a-page-to-be-forgotten-word-for-word/';
    seen('2026-11-01T12:00:00Z', PAGE);
    seen('2026-12-30T12:00:00Z', '/kept/');
    duty().run();
    assert.deepEqual(pages(), ['/kept/']);
    for (const held of [file, `${file}-wal`]) {
      if (existsSync(held)) assert.ok(!readFileSync(held).includes(PAGE), held);
    }
  });
});

// The *Policy violations* page's counts, through the service in its role for editors, on the admin
// host: an Admin's alone, as Forgejo says who is asking each time, an Editor told only that it is
// an Admin's, as the *Mail* page tells one. Against a stand-in for Forgejo.
describe('the policy\'s violations, for Admins', () => {
  // Who each credential is, to Forgejo: an Admin in the team `admins`, an Editor, a reader of the
  // repository who may not write, and the instance's administrator.
  const PEOPLE = {
    'token anna': { login: 'anna', is_admin: false, push: true },
    'token erik': { login: 'erik', is_admin: false, push: true },
    'token rita': { login: 'rita', is_admin: false, push: false },
    'token root': { login: 'root', is_admin: true, push: true },
  };
  const ROLES = 'token roles';
  const answerOf = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const forgejo = async (url, { headers }) => {
    const { pathname } = new URL(url);
    const person = PEOPLE[headers.authorization];
    if (pathname === '/api/v1/user') return person ? answerOf(person) : answerOf({}, 401);
    if (pathname === '/api/v1/repos/org/source') return person ? answerOf({ permissions: { push: person.push } }) : answerOf({}, 401);
    if (headers.authorization !== ROLES) return answerOf({}, 404);
    if (pathname === '/api/v1/orgs/org/teams') return answerOf([{ id: 7, name: 'admins' }]);
    if (pathname === '/api/v1/teams/7/members') return answerOf([{ login: 'anna' }]);
    throw new Error(`nothing to say of ${pathname}`);
  };

  let folder;
  let store;
  let server;
  let origin;

  const ask = async (authorization, method = 'GET') => {
    const answer = await fetch(`${origin}/_konzilo/violations`, { method, headers: authorization ? { authorization } : {} });
    return { status: answer.status, headers: answer.headers, body: await answer.json() };
  };

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-violations-page-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));
  beforeEach(async () => {
    rmSync(join(folder, 'service.sqlite'), { force: true });
    store = openStore(join(folder, 'service.sqlite'));
    const service = editorsService({ forgejo: 'http://forgejo', repository: 'org/source', token: 'read-token', rolesToken: 'roles', control: buildControl(join(folder, 'control')), store, get: forgejo });
    server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((go) => server.close(go));
    store.close();
  });

  test('gives an Admin, and the instance\'s administrator, the counts, the most recently seen first, with the days each is kept and the entries kept at most', async () => {
    const counts = violationCounts(store);
    counts.count([{ page: '/one/', directive: 'img-src', blocked: 'https://tracker.example' }], new Date('2026-11-24T10:00:00Z'));
    counts.count([{ page: '/two/', directive: 'script-src-elem', blocked: 'inline' }, { page: '/two/', directive: 'script-src-elem', blocked: 'inline' }], new Date('2026-11-25T10:00:00Z'));
    for (const who of ['token anna', 'token root']) {
      const { status, headers, body } = await ask(who);
      assert.equal(status, 200, who);
      assert.equal(headers.get('cache-control'), 'no-store');
      assert.deepEqual(body, {
        violations: [
          { page: '/two/', directive: 'script-src-elem', blocked: 'inline', count: 2, lastSeen: '2026-11-25T10:00:00.000Z' },
          { page: '/one/', directive: 'img-src', blocked: 'https://tracker.example', count: 1, lastSeen: '2026-11-24T10:00:00.000Z' },
        ],
        rest: null,
        days: 30,
        most: 1000,
      });
    }
  });

  test('tells an Editor only that it is an Admin\'s, and anyone who may not write, or is signed out, nothing', async () => {
    violationCounts(store).count([{ page: '/one/', directive: 'img-src', blocked: 'https://tracker.example' }], new Date('2026-11-24T10:00:00Z'));
    assert.deepEqual(await ask('token erik').then(({ status, body }) => [status, body]), [403, {}]);
    assert.deepEqual(await ask('token rita').then(({ status, body }) => [status, body]), [401, {}]);
    assert.deepEqual(await ask(null).then(({ status, body }) => [status, body]), [401, {}]);
    assert.equal((await ask('token anna', 'DELETE')).status, 405);
  });
});
