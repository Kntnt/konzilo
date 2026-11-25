// What the editor's *Feeds* page asks of the service and makes of its answers (ADR 0079), before it
// is React: the feeds, adding, changing and removing one, each problem beside its field, and why a
// feed could not be read, as the *Publishing* page says it too. The service's side is proved in
// service-feeds.test.js, and the two meet in a real browser in the Compose acceptance suite.

import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { addFeed, changeFeed, failureShown, feedProblemsShown, readFeeds, removeFeed } from '../src/cms/feeds/client.js';
import { useInterfaceLanguage } from '../src/cms/interface-language.js';

const zone = process.env.TZ;
process.env.TZ = 'Europe/Stockholm';
after(() => {
  process.env.TZ = zone;
  useInterfaceLanguage('en');
});

const SHOWN = { feeds: [], types: [{ name: 'article', label: 'Article', choosable: true }], languages: null };

function service(status, body) {
  const asked = [];
  const ask = async (address, { method = 'GET', headers, body: sent }) => {
    asked.push({ path: new URL(address, 'http://admin').pathname, method, headers, body: sent === undefined ? undefined : JSON.parse(sent) });
    return { ok: status < 400, status, json: async () => body };
  };
  return { asked, ask };
}

describe('asking the service', () => {
  test('reads the feeds, adds, changes and removes one, with the editor\'s credential', async () => {
    const stand = service(200, SHOWN);
    const credential = () => 'token mine';
    assert.deepEqual(await readFeeds({ credential, ask: stand.ask }), { feeds: SHOWN });
    assert.deepEqual(await addFeed({ credential, given: { address: 'https://news.example.com/feed', type: 'article', every: '5' }, ask: stand.ask }), { feeds: SHOWN });
    assert.deepEqual(await changeFeed({ credential, id: 3, given: { type: 'article', every: '10' }, ask: stand.ask }), { feeds: SHOWN });
    assert.deepEqual(await removeFeed({ credential, id: 3, ask: stand.ask }), { feeds: SHOWN });
    const json = { authorization: 'token mine', 'content-type': 'application/json' };
    assert.deepEqual(stand.asked, [
      { path: '/_konzilo/feeds', method: 'GET', headers: { authorization: 'token mine' }, body: undefined },
      { path: '/_konzilo/feeds', method: 'POST', headers: json, body: { address: 'https://news.example.com/feed', type: 'article', every: '5' } },
      { path: '/_konzilo/feeds/3', method: 'PUT', headers: json, body: { type: 'article', every: '10' } },
      { path: '/_konzilo/feeds/3', method: 'DELETE', headers: { authorization: 'token mine' }, body: undefined },
    ]);
  });

  test('gives the problems of a feed refused, by their fields, and tells an Editor that the feeds are an Admin\'s', async () => {
    assert.deepEqual(await addFeed({ credential: () => 'token mine', given: {}, ask: service(400, { problems: { address: 'missing' } }).ask }), { problems: { address: 'missing' } });
    assert.deepEqual(await readFeeds({ credential: () => 'token erik', ask: service(403, {}).ask }), { adminOnly: true });
    assert.equal(await readFeeds({ credential: () => null, ask: () => assert.fail('asks nothing') }), null);
    assert.equal(await removeFeed({ credential: () => 'token mine', id: 3, ask: service(502, {}).ask }), null);
  });
});

describe('the words', () => {
  test('say each problem beside its field', () => {
    useInterfaceLanguage('en');
    assert.deepEqual(feedProblemsShown({ address: 'taken', type: 'not-choosable', every: 'not-minutes' }), {
      address: 'The site reads a feed at this address already.',
      type: 'A feed cannot make posts of this type, which need more than a feed gives.',
      every: 'Write a whole number of minutes, from 1 to 1440.',
    });
  });

  test('say why a feed could not be read, by its kind, in the interface language', () => {
    useInterfaceLanguage('en');
    assert.equal(failureShown({ kind: 'status', status: 503 }), 'it answered with the status 503');
    assert.equal(failureShown({ kind: 'not-a-feed' }), 'its answer is no RSS or Atom feed');
    assert.equal(failureShown({ kind: 'something new' }), 'the service\'s log says why');
    useInterfaceLanguage('sv');
    assert.equal(failureShown({ kind: 'timeout' }), 'det tog längre än 30 sekunder att svara');
  });
});
