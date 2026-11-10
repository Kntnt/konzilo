// What an editor is told of publishing, from what the service answers, before it is React.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { useInterfaceLanguage } from '../src/cms/interface-language.js';
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
    assert.deepEqual(refused.details, ['the field title: give it a title', 'and this']);
    const gone = statusWords({ status: 'failed', reason: 'the site could not be built', stillShown: false });
    assert.equal(gone.words, 'Could not be published. It is not on the site.');
    assert.deepEqual(gone.details, ['the site could not be built']);
  });

  test('each refusal and warning in the interface language, by what it names in the post', () => {
    const refusals = [
      { field: 'title', name: 'refusal.title-empty', values: {}, reason: 'the site cannot publish a post without a title; give it one' },
      { block: { path: '2', name: 'heading' }, line: 9, name: 'refusal.heading-level', values: { level: 1, levels: { name: 'about.range', values: { from: 2, to: 6 } } }, reason: 'the site cannot publish a heading at level 1: the post\'s title is its level 1; use a level from 2 to 6' },
    ];
    const warnings = [{ field: 'image', name: 'warning.image-narrow', values: { name: 'a.png', width: 800, display: 1280 }, reason: 'the image a.png is 800 pixels wide, narrower than the 1280 the site usually shows images at, so it may look soft' }];
    try {
      useInterfaceLanguage('sv');
      assert.deepEqual(statusWords({ status: 'failed', refusals, stillShown: true }).details, [
        'fältet title: webbplatsen kan inte publicera ett inlägg utan titel; ge det en',
        'block 2 (heading): webbplatsen kan inte publicera en rubrik på nivå 1: inläggets titel är dess nivå 1; använd en nivå från 2 till 6',
      ]);
      assert.deepEqual(statusWords({ status: 'live', warnings }).details, ['fältet image: bilden a.png är 800 pixlar bred, smalare än de 1280 som webbplatsen oftast visar bilder i, så den kan se oskarp ut']);
      useInterfaceLanguage('en');
      assert.deepEqual(statusWords({ status: 'failed', refusals, stillShown: true }).details, [
        'the field title: the site cannot publish a post without a title; give it one',
        'block 2 (heading): the site cannot publish a heading at level 1: the post\'s title is its level 1; use a level from 2 to 6',
      ]);
    } finally {
      useInterfaceLanguage('en');
    }
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
