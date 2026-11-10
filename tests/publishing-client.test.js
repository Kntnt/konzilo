// What an editor is told of publishing, from what the service answers, before it is React.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { useInterfaceLanguage } from '../src/cms/body/texts.js';
import { filesOf, languageOf, readStatus, statusWords, watchStatus } from '../src/cms/publishing/status.js';

describe('what a status says', () => {
  test('live, with what to look at', () => {
    assert.deepEqual(statusWords({ status: 'live', warnings: [] }), { tone: 'good', words: 'Live on the site.', details: [] });
    const warned = statusWords({ status: 'live', warnings: [{ reason: 'the image is narrow' }] });
    assert.equal(warned.tone, 'good');
    assert.deepEqual(warned.details, ['the image is narrow']);
  });

  test('failed, with each refusal, and whether visitors still see the last version', () => {
    const refused = statusWords({ status: 'failed', refusals: [{ field: 'title', reason: 'give it a title' }, { reason: 'and this' }], stillShown: true });
    assert.equal(refused.tone, 'bad');
    assert.equal(refused.words, 'Could not be published. Visitors still see the last version.');
    assert.deepEqual(refused.details, ['give it a title', 'and this']);
    const gone = statusWords({ status: 'failed', reason: 'the site could not be built', stillShown: false });
    assert.equal(gone.words, 'Could not be published. It is not on the site.');
    assert.deepEqual(gone.details, ['the site could not be built']);
  });

  test('on its way, and what visitors see meanwhile', () => {
    assert.equal(statusWords({ status: 'being-published', stillShown: false }).tone, 'busy');
    assert.match(statusWords({ status: 'being-published', stillShown: true }).words, /visitors see the last version/);
    assert.doesNotMatch(statusWords({ status: 'being-published', stillShown: false }).words, /last version/);
  });

  test('a draft and a scheduled post', () => {
    assert.equal(statusWords({ status: 'draft', stillShown: false }).words, 'A draft, which is not on the site.');
    assert.equal(statusWords({ status: 'draft', stillShown: true }).words, 'A draft, on its way off the site.');
    assert.equal(statusWords({ status: 'scheduled', at: '2026-12-24T15:00:00Z' }, (at) => `at ${at}`).words, 'Scheduled: goes live at 2026-12-24T15:00:00Z.');
  });

  test('in the interface language, the moment of a scheduled post too, whatever the browser\'s', () => {
    try {
      useInterfaceLanguage('sv');
      assert.equal(statusWords({ status: 'live', warnings: [] }).words, 'Publicerad på webbplatsen.');
      assert.equal(statusWords({ status: 'failed', reason: 'x', stillShown: true }).words, 'Kunde inte publiceras. Besökare ser fortfarande den förra versionen.');
      assert.match(statusWords({ status: 'scheduled', at: '2026-12-24T15:00:00Z' }).words, /^Schemalagd: publiceras 2026-12-24 \d\d:00:00\.$/);
      useInterfaceLanguage('en');
      assert.match(statusWords({ status: 'scheduled', at: '2026-12-24T15:00:00Z' }).words, /^Scheduled: goes live 24\/12\/2026, \d\d:00:00\.$/);
    } finally {
      useInterfaceLanguage('en');
    }
  });
});

describe('a post\'s files', () => {
  const posts = [{ file: 'articles/aaa.md' }, { file: 'articles/sv-SE/bbb.md' }, { file: 'articles/en-GB/bbb.md' }, { file: 'pages/aaa.md' }, { file: 'articles/xaaa.md' }];

  test('are its own, in its type, by its ID, in each language', () => {
    assert.deepEqual(filesOf(posts, 'articles', 'aaa').map(({ file }) => file), ['articles/aaa.md']);
    assert.deepEqual(filesOf(posts, 'articles', 'bbb').map(({ file }) => file), ['articles/sv-SE/bbb.md', 'articles/en-GB/bbb.md']);
    assert.deepEqual(filesOf(posts, 'pages', 'bbb'), []);
  });

  test('say which language they are in', () => {
    assert.equal(languageOf({ file: 'articles/sv-SE/bbb.md' }), 'sv-SE');
    assert.equal(languageOf({ file: 'articles/aaa.md' }), null);
  });
});

describe('asking the service', () => {
  test('sends the editor\'s credential, and is told', async () => {
    const asked = [];
    const status = await readStatus({
      credential: () => 'token a-token',
      get: async (path, { headers }) => {
        asked.push({ path, authorization: headers.authorization });
        return { ok: true, json: async () => ({ posts: [] }) };
      },
    });
    assert.deepEqual(status, { posts: [] });
    assert.deepEqual(asked, [{ path: '/_konzilo/status', authorization: 'token a-token' }]);
  });

  test('cannot tell without a credential, a service, or an answer it may have', async () => {
    assert.equal(await readStatus({ credential: () => null, get: () => assert.fail('asks nothing') }), null);
    assert.equal(await readStatus({ credential: () => 'token a', get: async () => { throw new Error('away'); } }), null);
    assert.equal(await readStatus({ credential: () => 'token a', get: async () => ({ ok: false }) }), null);
  });
});

describe('watching', () => {
  // A clock that runs what waits only when told to, and says how long it was asked to wait.
  const clock = () => {
    const waiting = [];
    return {
      waited: () => waiting.map(({ ms }) => ms),
      wait: (run, ms) => {
        const one = { run, ms };
        waiting.push(one);
        return one;
      },
      stopWaiting: (one) => {
        const at = waiting.indexOf(one);
        if (at !== -1) waiting.splice(at, 1);
      },
      next: async () => {
        await waiting.shift().run();
      },
    };
  };
  const settled = () => new Promise((go) => setImmediate(go));

  test('asks often while something is on its way, and seldom otherwise', async () => {
    const time = clock();
    const answers = [{ posts: [{ status: 'being-published' }] }, { posts: [{ status: 'live' }] }];
    const told = [];
    const watch = watchStatus({ read: async () => answers.shift(), changed: (one) => told.push(one), wait: time.wait, stopWaiting: time.stopWaiting, hidden: () => false, soon: 1, later: 2 });
    await settled();
    assert.deepEqual(time.waited(), [1]);
    await time.next();
    assert.deepEqual(time.waited(), [2]);
    assert.equal(told.length, 2);
    watch.close();
    assert.deepEqual(time.waited(), []);
  });

  test('asks nothing while the page is hidden', async () => {
    const time = clock();
    let reads = 0;
    let hidden = true;
    const watch = watchStatus({ read: async () => { reads += 1; return { posts: [] }; }, changed: () => {}, wait: time.wait, stopWaiting: time.stopWaiting, hidden: () => hidden, soon: 1, later: 2 });
    await settled();
    assert.equal(reads, 0);
    hidden = false;
    await time.next();
    assert.equal(reads, 1);
    watch.close();
  });

  test('tells nobody once it is closed, though an answer was on its way', async () => {
    const time = clock();
    let answer;
    const told = [];
    const watch = watchStatus({ read: () => new Promise((go) => { answer = go; }), changed: (one) => told.push(one), wait: time.wait, stopWaiting: time.stopWaiting, hidden: () => false });
    await settled();
    watch.close();
    answer({ posts: [] });
    await settled();
    assert.deepEqual(told, []);
    assert.deepEqual(time.waited(), []);
  });

  test('looks at once when told to, and goes on from there', async () => {
    const time = clock();
    let reads = 0;
    const watch = watchStatus({ read: async () => { reads += 1; return { posts: [] }; }, changed: () => {}, wait: time.wait, stopWaiting: time.stopWaiting, hidden: () => false });
    await settled();
    await watch.look();
    assert.equal(reads, 2);
    assert.equal(time.waited().length, 1, 'one wait, not two');
    watch.close();
  });
});
