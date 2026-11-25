// The consent records (ADR 0049), through the service: in its role for visitors, a record of each
// choice taken at /_konzilo/consent, as the web server passes it on, checked against the consent
// revisions the site has published, each kept with what it showed the visitor, and stored, or
// counted past the limits; and its timed duty, which forgets a record after 13 months. What is
// kept is read back from the service's store. The client's sending is proved in
// consent-client.test.js, the Admin's page in consent-records-page.test.js, and they meet in a
// real browser in the Compose acceptance suite.

import assert from 'node:assert/strict';
import { existsSync, lutimesSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';

import { consentRetention } from '../src/service/consent-records.js';
import { openStore } from '../src/service/store.js';
import { visitorsService } from '../src/service/visitors.js';
import { siteDescription } from '../src/site-description.js';

const HOST = 'www.example.com';
const SITE = `https://${HOST}`;
const REVISION = '0123456789abcdef';
const NEXT = 'fedcba9876543210';

// What a page of a release showed a visitor of the consent, in one language, as the build writes
// it beside the release's pages.
const shown = (title) => ({
  banner: { title, text: `${title}: we would like your consent.`, accept: 'Accept all', reject: 'Reject optional', customise: 'Customise' },
  dialog: { title: 'Privacy settings', introduction: 'Choose what we may use.', accept: 'Accept all', reject: 'Reject optional', save: 'Save choices' },
  categories: [
    { id: 'necessary', name: 'Necessary', description: 'What the site needs.', services: [{ id: 'konzilo', name: 'The site', purpose: 'Keeps your choice.', necessity: 'Without it you would be asked again.', provider: null }] },
    { id: 'functional', name: 'Functional', description: 'Videos.', services: [{ id: 'youtube', name: 'YouTube', purpose: 'Shows videos.', necessity: null, provider: 'Google Ireland Limited, Ireland' }] },
    { id: 'statistics', name: 'Statistics', description: 'Counting visits.', services: [{ id: 'matomo', name: 'Matomo', purpose: 'Counts visits.', necessity: null, provider: null }] },
    { id: 'marketing', name: 'Marketing', description: 'Nothing yet.', services: [] },
  ],
  placeholders: [{ service: 'youtube', question: 'Show this video from YouTube?', storage: 'YouTube may store data in your browser.', button: 'Allow and play' }],
  policies: [{ title: 'Privacy policy', href: '/privacy-policy/' }],
});

// The consent revision a release holds, with its categories' services and what each language's
// pages showed.
const published = (revision = REVISION, { languages = { 'en-GB': shown('Cookies'), 'sv-SE': shown('Kakor') }, categories = { necessary: ['konzilo'], functional: ['youtube'], statistics: ['matomo'], marketing: [] } } = {}) => ({ revision, categories, languages });

// A record as the consent client sends it from a page of the site (src/consent/client.js).
const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const recordOf = (more = {}) => ({
  id: ID,
  chosen: '2026-11-11T09:59:58.000Z',
  revision: REVISION,
  categories: { necessary: true, functional: true, statistics: false, marketing: true },
  services: { konzilo: true, youtube: true, matomo: false },
  how: 'banner',
  control: 'accept',
  path: '/about/',
  language: 'en-GB',
  ...more,
});

// A request as the web server passes it on (ADR 0044). Gives { status, headers, body, json }.
function send(origin, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const asked = request(new URL(path, origin), { method, headers, agent: false }, (answer) => {
      const chunks = [];
      answer.on('data', (chunk) => chunks.push(chunk));
      answer.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          // Not JSON.
        }
        resolve({ status: answer.statusCode, headers: answer.headers, body: text, json });
      });
    });
    asked.on('error', reject);
    asked.end(body);
  });
}

describe('the consent records, for visitors', () => {
  let folder;
  let releases;
  let store;
  let server;
  let origin;
  let clock;

  const later = (seconds) => {
    clock = new Date(clock.getTime() + seconds * 1000);
  };

  // Where a browser on a page of the site says a request came from, with what it sends of itself,
  // and the web server's own headers, from the visitor at `address`.
  const fromThePage = (address = '192.0.2.7') => ({ 'Sec-Fetch-Site': 'same-origin', Origin: SITE, 'User-Agent': 'Mozilla/5.0 (Ada\'s own browser)', 'X-Konzilo-Client': address, 'X-Konzilo-Host': HOST });
  const sendRecord = (record = recordOf(), headers = fromThePage()) => send(origin, 'POST', '/_konzilo/consent', {
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: typeof record === 'string' ? record : JSON.stringify(record),
  });

  // A release made current, as the builder moves `current` to it, with its consent revision.
  let releaseNumber = 0;
  const release = (holds) => {
    releaseNumber += 1;
    const name = `release-${releaseNumber}`;
    mkdirSync(join(releases, 'releases', name, 'pages'), { recursive: true });
    if (holds) writeFileSync(join(releases, 'releases', name, 'consent.json'), JSON.stringify(holds));
    rmSync(join(releases, 'current'), { force: true });
    symlinkSync(join('releases', name), join(releases, 'current'));
    // It went live now, by the site's clock.
    lutimesSync(join(releases, 'current'), clock, clock);
  };

  // What the store holds of a consent ID, each record without what it showed.
  const kept = (id = ID) => store.consentRecords.of(id).map(({ shown: _, ...record }) => record);

  const start = async () => {
    store = openStore(join(folder, 'service.sqlite'));
    const site = siteDescription({ language: 'en_GB', types: { note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/{slug}/', elements: ['paragraph'], fields: {} } } });
    const service = visitorsService({ site: () => site, store, hosts: [HOST], releases, now: () => clock });
    server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    origin = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    server.closeAllConnections();
    await new Promise((go) => server.close(go));
    store.close();
  };

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-consent-records-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  beforeEach(async () => {
    rmSync(join(folder, 'service.sqlite'), { force: true });
    rmSync(join(folder, 'service.sqlite-wal'), { force: true });
    rmSync(join(folder, 'service.sqlite-shm'), { force: true });
    releases = join(folder, `site-public-${releaseNumber}`);
    mkdirSync(releases, { recursive: true });
    clock = new Date('2026-11-11T09:00:00Z');
    release(published());
    clock = new Date('2026-11-11T10:00:00Z');
    await start();
  });
  afterEach(stop);

  test('stores a choice as a record of exactly what the client sent, and answers that it is stored', async () => {
    const answer = await sendRecord();
    assert.equal(answer.status, 204, answer.body);
    assert.equal(answer.body, '');
    assert.equal(answer.headers['set-cookie'], undefined);
    assert.equal(answer.headers['cache-control'], 'no-store');
    assert.deepEqual(kept(), [recordOf()]);
  });

  test('keeps nothing of the visitor\'s address, browser or the page the request came from in the service\'s data', async () => {
    assert.equal((await sendRecord(recordOf(), { ...fromThePage('198.51.100.23'), Referer: `${SITE}/about/?campaign=autumn` })).status, 204);
    for (const name of ['service.sqlite', 'service.sqlite-wal']) {
      const file = join(folder, name);
      if (!existsSync(file)) continue;
      const bytes = readFileSync(file);
      for (const trace of ['198.51.100.23', 'Ada\'s own browser', 'campaign=autumn']) assert.ok(!bytes.includes(trace), `${name}: ${trace}`);
    }
  });

  test('keeps the same record sent twice once, and answers each time that it is stored', async () => {
    assert.equal((await sendRecord()).status, 204);
    assert.equal((await sendRecord()).status, 204);
    const later = recordOf({ chosen: '2026-11-11T09:59:59.000Z', how: 'dialog', control: 'save', services: { konzilo: true, youtube: false, matomo: true }, categories: { necessary: true, functional: false, statistics: true, marketing: true } });
    assert.equal((await sendRecord(later)).status, 204);
    assert.deepEqual(kept(), [recordOf(), later]);
  });

  test('refuses a record of a revision the site has not published, or whose categories or services are not exactly that revision\'s, or in a language its pages were not shown in, and stores none', async () => {
    const wrong = [
      recordOf({ revision: NEXT }),
      recordOf({ categories: { necessary: true, functional: true, statistics: false } }),
      recordOf({ categories: { necessary: true, functional: true, statistics: false, marketing: true, other: true } }),
      recordOf({ services: { konzilo: true, youtube: true } }),
      recordOf({ services: { konzilo: true, youtube: true, matomo: false, vimeo: true } }),
      recordOf({ services: { konzilo: true, youtube: 'yes', matomo: false } }),
      recordOf({ language: 'de-DE' }),
    ];
    for (const record of wrong) assert.equal((await sendRecord(record)).status, 400, JSON.stringify(record));
    assert.deepEqual(kept(), []);
  });

  test('refuses a body that is no record: a field more or less, a consent ID, time, part, control or path of another shape, or a time far from now', async () => {
    const { language: _, ...withoutLanguage } = recordOf();
    const wrong = [
      'not JSON',
      '[]',
      withoutLanguage,
      recordOf({ address: '192.0.2.7' }),
      recordOf({ id: 'not-an-id' }),
      recordOf({ chosen: 'yesterday' }),
      recordOf({ chosen: '2026-11-12T10:00:01.000Z' }),
      recordOf({ chosen: '2025-10-11T09:59:59.000Z' }),
      recordOf({ how: 'popup' }),
      recordOf({ control: 'ignore' }),
      recordOf({ path: 'https://elsewhere.example/' }),
      recordOf({ path: '/a page/' }),
    ];
    for (const record of wrong) assert.equal((await sendRecord(record)).status, 400, JSON.stringify(record));
    assert.deepEqual(kept(), []);
    assert.equal((await sendRecord(recordOf({ chosen: '2026-11-12T09:59:59.000Z' }))).status, 204, 'by a clock a day ahead');
  });

  test('refuses a record from a page that is not the site\'s own, by what the browser says, and stores none', async () => {
    for (const headers of [
      { ...fromThePage(), 'Sec-Fetch-Site': 'cross-site', Origin: 'https://elsewhere.example' },
      { 'X-Konzilo-Client': '192.0.2.7', 'X-Konzilo-Host': HOST, Origin: 'https://elsewhere.example' },
      { 'X-Konzilo-Client': '192.0.2.7', 'X-Konzilo-Host': HOST },
    ]) {
      const answer = await sendRecord(recordOf(), headers);
      assert.equal(answer.status, 403, JSON.stringify(headers));
    }
    assert.deepEqual(kept(), []);
  });

  test('takes a record of a revision published since the service started as soon as its release is in use, and still one of the revision before', async () => {
    release(published(NEXT));
    const next = recordOf({ revision: NEXT, chosen: '2026-11-11T09:59:59.000Z' });
    assert.equal((await sendRecord(next)).status, 204);
    assert.equal((await sendRecord()).status, 204);
    assert.deepEqual(kept(), [recordOf(), next]);
  });

  test('keeps each record with what its revision showed the visitor, in its language, at its time', async () => {
    const swedish = recordOf({ language: 'sv-SE', chosen: '2026-11-11T09:59:57.000Z' });
    assert.equal((await sendRecord(swedish)).status, 204);
    assert.equal((await sendRecord()).status, 204);
    // The same revision, with words an Admin changed, published later, and then the first words
    // again.
    later(60);
    release(published(REVISION, { languages: { 'en-GB': shown('Your privacy'), 'sv-SE': shown('Kakor') } }));
    const changed = recordOf({ chosen: '2026-11-11T10:01:30.000Z', control: 'reject', services: { konzilo: true, youtube: false, matomo: false }, categories: { necessary: true, functional: false, statistics: false, marketing: true } });
    assert.equal((await sendRecord(changed)).status, 204);
    later(60);
    release(published());
    assert.equal((await sendRecord(recordOf({ chosen: '2026-11-11T10:02:30.000Z' }))).status, 204);
    // By a visitor's clock that is behind the site's, before any release the service has seen.
    assert.equal((await sendRecord(recordOf({ chosen: '2026-11-11T08:00:00.000Z' }))).status, 204);
    assert.deepEqual(store.consentRecords.of(ID).map(({ shown: words }) => words.banner.title), ['Cookies', 'Kakor', 'Cookies', 'Your privacy', 'Cookies']);
    assert.deepEqual(store.consentRecords.of(ID)[1].shown, shown('Kakor'));
  });

  // A record of its own, the `n`th, made a second after the last.
  const nth = (n) => recordOf({ id: `6f1c2a3b-4d5e-4f60-8a7b-${String(n).padStart(12, '0')}`, chosen: new Date(Date.parse('2026-11-11T08:00:00.000Z') + n * 1000).toISOString() });
  const day = () => store.consentRecords.days('2026-11-11', '2026-11-11')[0];
  const storedThatDay = () => Object.entries(day()).filter(([name]) => !['day', 'notStored'].includes(name)).reduce((sum, [, count]) => sum + count, 0);

  test('stores 100 records of one client in its window of ten minutes, and counts the next without storing it, saying when to try again, as another client\'s are stored', async () => {
    for (let n = 0; n < 100; n += 1) assert.equal((await sendRecord(nth(n))).status, 204, `record ${n}`);
    later(5 * 60);
    const over = await sendRecord(nth(100));
    assert.equal(over.status, 429);
    assert.equal(over.headers['retry-after'], '300', 'until the window ends');
    assert.deepEqual(store.consentRecords.of(nth(100).id), [], 'not stored');
    assert.equal((await sendRecord(nth(101), fromThePage('192.0.2.8'))).status, 204, 'another client');
    assert.equal(storedThatDay(), 101);
    assert.equal(day().notStored, 1, 'counted');
    later(5 * 60);
    assert.equal((await sendRecord(nth(100))).status, 204, 'in the next window');
  });

  test('stores 3600 records in one of the clock\'s hours, and counts the rest of the hour without storing them', async () => {
    clock = new Date('2026-11-11T10:20:00Z');
    let n = 0;
    for (let client = 0; client < 36; client += 1) {
      for (let one = 0; one < 100; one += 1, n += 1) assert.equal((await sendRecord(nth(n), fromThePage(`192.0.2.${client}`))).status, 204, `record ${n}`);
    }
    const over = await sendRecord(nth(n), fromThePage('192.0.2.200'));
    assert.equal(over.status, 429);
    assert.equal(over.headers['retry-after'], String(40 * 60), 'until the hour ends');
    assert.equal(storedThatDay(), 3600);
    assert.equal(day().notStored, 1);
    clock = new Date('2026-11-11T11:00:00Z');
    assert.equal((await sendRecord(nth(n), fromThePage('192.0.2.200'))).status, 204, 'in the next hour');
  });

  test('refuses every record while no release in use holds a consent revision, and takes one once a release does', async () => {
    rmSync(join(releases, 'current'), { force: true });
    await stop();
    rmSync(join(folder, 'service.sqlite'), { force: true });
    rmSync(join(folder, 'service.sqlite-wal'), { force: true });
    await start();
    assert.equal((await sendRecord()).status, 400);
    release(published());
    assert.equal((await sendRecord()).status, 204);
  });
});

describe('keeping the consent records for 13 months', () => {
  let folder;
  let file;
  let store;
  let clock;

  const duty = () => consentRetention({ store, now: () => clock });
  const record = (id, chosen) => ({ ...recordOf({ id, chosen }) });
  const ids = (...consentIds) => consentIds.flatMap((id) => store.consentRecords.of(id).map(({ chosen }) => chosen));

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-consent-retention-'));
    file = join(folder, 'service.sqlite');
  });
  after(() => rmSync(folder, { recursive: true, force: true }));
  beforeEach(() => {
    rmSync(file, { force: true });
    store = openStore(file);
    clock = new Date('2027-12-31T12:00:00Z');
  });
  afterEach(() => store.close());

  test('forgets a record 13 months after it was made, and the count of a day 13 months gone, and keeps the rest', () => {
    const OLD = '11111111-1111-4111-8111-111111111111';
    const NEW = '22222222-2222-4222-8222-222222222222';
    store.consentRecords.keep(record(OLD, '2026-11-30T11:59:59.999Z'));
    store.consentRecords.keep(record(NEW, '2026-11-30T12:00:00.000Z'));
    store.consentRecords.notStored(new Date('2026-11-29T23:00:00Z'));
    store.consentRecords.notStored(new Date('2026-11-30T01:00:00Z'));
    assert.equal(duty().run(), 1);
    assert.deepEqual(ids(OLD, NEW), ['2026-11-30T12:00:00.000Z']);
    assert.deepEqual(store.consentRecords.days('2026-11-29', '2026-11-30').map(({ notStored }) => notStored), [0, 1]);
  });

  // The service's data goes into backups and the archive (ADR 0006), which must not carry what
  // was forgotten in the free space of the database's pages, or in its log of writes.
  test('leaves nothing of what it forgets in the service\'s data files, and forgets what grew too old while it was stopped once it starts', () => {
    const OLD = '33333333-3333-4333-8333-333333333333';
    store.consentRecords.keep({ ...record(OLD, '2026-11-01T12:00:00.000Z'), path: '/a-page-to-be-forgotten/' });
    store.consentRecords.keep(record('44444444-4444-4444-8444-444444444444', '2027-11-01T12:00:00.000Z'));
    store.close();
    store = openStore(file);
    duty().run();
    assert.deepEqual(ids(OLD), []);
    for (const held of [file, `${file}-wal`]) {
      if (existsSync(held)) assert.ok(!readFileSync(held).includes('a-page-to-be-forgotten'), held);
    }
  });
});
