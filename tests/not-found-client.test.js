// What the *Addresses not found* page does (ADR 0040), against stand-ins for Forgejo and the
// service: *Redirect…* and *Answer 410* each add a rule for the address to the source's
// `redirects.json` as an Admin's save of the redirect rules (ADR 0036), one commit made through
// Forgejo's API with what Sveltia signed in with, after the checks the intake runs, so that a rule
// the site would refuse, which would hold up every rule, is never saved; *Hide* asks the service.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { hideNotFound, readNotFound, ruleMayBeMade, saveRule } from '../src/cms/not-found/client.js';

const API = 'http://git/api/v1';
const SIGNED_IN = 'token anna';
const credential = () => SIGNED_IN;
const SOURCE = { api: API, repository: 'org/source', branch: 'main', credential };

const fromBase64 = (content) => Buffer.from(content, 'base64').toString();
const toBase64 = (text) => Buffer.from(text).toString('base64');

// Forgejo with the source's redirects.json as `text`, or none, answering each commit in turn as
// `answers` says: 201 saves it, `in` saves it and answers 502 all the same, and any other status
// saves nothing.
const forgejo = ({ text = null, answers = [] } = {}) => {
  const asked = [];
  const commits = [];
  let file = text === null ? null : { text, sha: 'sha-1' };
  const ask = async (address, init = {}) => {
    const url = new URL(address);
    asked.push({ method: init.method ?? 'GET', path: `${url.pathname}${url.search}`, authorization: init.headers?.authorization });
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (url.pathname === '/api/v1/repos/org/source/contents/redirects.json' && (init.method ?? 'GET') === 'GET') {
      assert.equal(url.searchParams.get('ref'), 'main');
      return file === null ? json({}, 404) : json({ content: toBase64(file.text), sha: file.sha, encoding: 'base64' });
    }
    if (url.pathname === '/api/v1/repos/org/source/contents' && init.method === 'POST') {
      const body = JSON.parse(init.body);
      const status = answers.shift() ?? 201;
      if (status === 201 || status === 'in') {
        commits.push(body);
        const [one] = body.files;
        file = { text: fromBase64(one.content), sha: `sha-${commits.length + 1}` };
      }
      return json({}, status === 'in' ? 502 : status);
    }
    throw new Error(`nothing to say of ${url.pathname}`);
  };
  return { ask, asked, commits, file: () => file };
};

const pause = async () => {};

describe('a rule made from an address not found', () => {
  test('is added to the source\'s redirects.json, as the Admin, by one commit, a redirect as a 301 and a gone address as a 410', async () => {
    const source = forgejo({ text: '{\n  "rules": [\n    { "from": "/a/", "to": "/b/", "status": 301 }\n  ]\n}\n' });
    assert.deepEqual(await saveRule({ ...SOURCE, address: '/old/', to: '/new/', ask: source.ask, pause }), { saved: true });
    assert.deepEqual(await saveRule({ ...SOURCE, address: '/gone/', ask: source.ask, pause }), { saved: true });
    assert.equal(source.commits.length, 2);
    const [first, second] = source.commits;
    assert.equal(first.branch, 'main');
    assert.deepEqual(first.files.map(({ operation, path, sha }) => [operation, path, sha]), [['update', 'redirects.json', 'sha-1']]);
    assert.equal(second.files[0].sha, 'sha-2');
    assert.equal(source.file().text, `${JSON.stringify({ rules: [{ from: '/a/', to: '/b/', status: 301 }, { from: '/old/', to: '/new/', status: 301 }, { from: '/gone/', status: 410 }] }, null, 2)}\n`);
    assert.match(first.message, /\/old\/.*\/new\//);
    assert.match(second.message, /\/gone\/.*410/);
    assert.ok(source.asked.every(({ authorization }) => authorization === SIGNED_IN));
  });

  test('makes the file where the source has none, and keeps a list the source holds as a list', async () => {
    const none = forgejo();
    assert.deepEqual(await saveRule({ ...SOURCE, address: '/gone/', ask: none.ask, pause }), { saved: true });
    assert.deepEqual(none.commits[0].files.map(({ operation, path, sha }) => [operation, path, sha]), [['create', 'redirects.json', undefined]]);
    assert.deepEqual(JSON.parse(none.file().text), { rules: [{ from: '/gone/', status: 410 }] });
    const listed = forgejo({ text: '[]' });
    await saveRule({ ...SOURCE, address: '/gone/', ask: listed.ask, pause });
    assert.deepEqual(JSON.parse(listed.file().text), [{ from: '/gone/', status: 410 }]);
  });

  test('is refused as the site would refuse it, and nothing is saved', async () => {
    for (const [to, name] of [['', 'about.target-missing'], ['news/', 'about.target-form'], ['http://elsewhere.example/', 'about.target-form'], ['/old', 'refusal.rule-loop']]) {
      const source = forgejo({ text: '{ "rules": [] }' });
      const { refusal } = await saveRule({ ...SOURCE, address: '/old/', to, ask: source.ask, pause });
      const names = JSON.stringify(refusal);
      assert.ok(names.includes(`"${name}"`), `${to}: ${names}`);
      assert.equal(source.commits.length, 0, to);
    }
  });

  test('is refused where it would close a loop with a rule the site has', async () => {
    const source = forgejo({ text: '{ "rules": [{ "from": "/new/", "to": "/old/", "status": 301 }] }' });
    const { refusal } = await saveRule({ ...SOURCE, address: '/old/', to: '/new/', ask: source.ask, pause });
    assert.equal(refusal.name, 'refusal.rule-loop');
    assert.equal(source.commits.length, 0);
  });

  test('is added beside a rule the site refuses already, which it neither mends nor blames on the new one', async () => {
    const source = forgejo({ text: '{ "rules": [{ "from": "/broken/", "status": 999 }] }' });
    assert.deepEqual(await saveRule({ ...SOURCE, address: '/gone/', ask: source.ask, pause }), { saved: true });
    assert.equal(JSON.parse(source.file().text).rules.length, 2);
  });

  test('is not made again where a rule holds the address already, and refused where one holds it without its last slash', async () => {
    const source = forgejo({ text: '{ "rules": [{ "from": "/old/", "status": 410 }] }' });
    assert.deepEqual(await saveRule({ ...SOURCE, address: '/old', to: '/new/', ask: source.ask, pause }), { saved: true });
    assert.equal(source.commits.length, 0);
    const slashless = forgejo({ text: '{ "rules": [{ "from": "/old", "status": 410 }] }' });
    assert.equal((await saveRule({ ...SOURCE, address: '/old/', to: '/new/', ask: slashless.ask, pause })).refusal.name, 'refusal.rule-twice');
    assert.equal(slashless.commits.length, 0);
  });

  test('says so, and saves nothing, where the source\'s rules are in a file the site cannot read', async () => {
    for (const text of ['not json', '{ "rules": "none" }']) {
      const source = forgejo({ text });
      assert.deepEqual(await saveRule({ ...SOURCE, address: '/gone/', ask: source.ask, pause }), { refusal: { name: 'notFound.unreadableRules', values: {} } });
      assert.equal(source.commits.length, 0);
    }
  });

  test('is tried again, from the file as it is then, where another commit came first, and is done where one that failed went in', async () => {
    const raced = forgejo({ text: '{ "rules": [] }', answers: [409, 201] });
    assert.deepEqual(await saveRule({ ...SOURCE, address: '/gone/', ask: raced.ask, pause }), { saved: true });
    assert.equal(raced.commits.length, 1);
    const wentIn = forgejo({ text: '{ "rules": [] }', answers: ['in'] });
    assert.deepEqual(await saveRule({ ...SOURCE, address: '/gone/', ask: wentIn.ask, pause }), { saved: true });
    assert.equal(wentIn.commits.length, 1);
    const refused = forgejo({ text: '{ "rules": [] }', answers: [403] });
    await assert.rejects(saveRule({ ...SOURCE, address: '/gone/', ask: refused.ask, pause }), /403/);
    const busy = forgejo({ text: '{ "rules": [] }', answers: [409, 409, 409, 409] });
    await assert.rejects(saveRule({ ...SOURCE, address: '/gone/', ask: busy.ask, pause }), /409/);
  });

  test('may be made only at an address a rule may have as its source', () => {
    for (const address of ['/old/', '/old', '/caf%C3%A9/', '/a/b.html']) assert.equal(ruleMayBeMade(address), true, address);
    for (const address of ['/_astro/x.js', '/sitemap-2.xml', '/robots.txt', '/a//b/', '/a b/', '/"quoted"/']) assert.equal(ruleMayBeMade(address), false, address);
  });
});

describe('the addresses not found, from the service', () => {
  const service = (status, body = {}) => {
    const asked = [];
    const ask = async (address, init) => {
      asked.push({ address, ...init });
      return { ok: status < 400, status, json: async () => body };
    };
    return { ask, asked };
  };

  test('are read and hidden with what Sveltia signed in with', async () => {
    const listed = { addresses: [{ address: '/x/', count: 2, last: '2026-11-25T10:00:00.000Z' }] };
    const reading = service(200, listed);
    assert.deepEqual(await readNotFound({ credential, ask: reading.ask }), listed);
    assert.deepEqual([reading.asked[0].address, reading.asked[0].headers.authorization], ['/_konzilo/not-found', SIGNED_IN]);
    const hiding = service(200, { addresses: [] });
    assert.deepEqual(await hideNotFound({ credential, address: '/x/', ask: hiding.ask }), { addresses: [] });
    assert.deepEqual([hiding.asked[0].address, hiding.asked[0].method, hiding.asked[0].body], ['/_konzilo/not-found/hidden', 'POST', '{"address":"/x/"}']);
  });

  test('are an Admin\'s alone, and cannot be told without the service', async () => {
    assert.deepEqual(await readNotFound({ credential, ask: service(403).ask }), { adminOnly: true });
    assert.equal(await readNotFound({ credential, ask: service(502).ask }), null);
    assert.equal(await readNotFound({ credential: () => null, ask: service(200).ask }), null);
    assert.equal(await hideNotFound({ credential, address: '/x/', ask: service(500).ask }), null);
  });
});
