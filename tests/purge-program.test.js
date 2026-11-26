// The purge's program (ADR 0078): it takes the purge the service asks for, holds the builds back
// while it runs, once a build that runs has ended, says how it stands, and asks for a build once it
// is done, so that the release in use holds nothing of what it purged.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { purgeControl } from '../src/purge/control.js';
import { PurgeRefusal } from '../src/purge/histories.js';
import { purgeOnRequest } from '../src/purge/program.js';

const folder = mkdtempSync(join(tmpdir(), 'konzilo-purge-program-'));
after(() => rmSync(folder, { recursive: true, force: true }));
let count = 0;
// The folder the program shares with the builder and the one it shares with the service alone, as
// one, since the tests stand in for both.
const controlOf = () => {
  count += 1;
  return { ...buildControl(join(folder, String(count), 'control')), ...purgeControl(join(folder, String(count), 'purge-control')) };
};

// Runs the program until it has looked `looks` times with nothing to do.
const running = async (control, purge, { looks = 1, during = () => {}, search = async () => ({}) } = {}) => {
  let left = looks;
  await purgeOnRequest({
    control,
    purgeControl: control,
    purge,
    search,
    now: () => new Date('2026-11-26T10:00:00Z'),
    warn: () => {},
    sleep: async () => {
      during();
      left -= 1;
    },
    going: () => left > 0,
  });
};

describe('the purge\'s program', () => {
  test('purges what is asked, with the builds held back, and asks for a build after', async () => {
    const control = controlOf();
    const seen = [];
    control.askPurge({ id: 'p1', path: 'articles/aaaaaaaaaaaa.md' });
    await running(control, async (request) => {
      seen.push({ request, held: control.buildsHeld(), state: control.purgeState() });
      return { purges: [{ at: '2026-11-26T10:00:00Z', by: { login: 'anna', name: 'Anna' } }] };
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].request.path, 'articles/aaaaaaaaaaaa.md');
    assert.equal(seen[0].held, true, 'no build runs meanwhile');
    assert.deepEqual(seen[0].state, { id: 'p1', state: 'running', at: '2026-11-26T10:00:00.000Z' });
    assert.deepEqual(control.purgeState(), { id: 'p1', state: 'done', at: '2026-11-26T10:00:00.000Z' });
    assert.equal(control.buildsHeld(), false);
    assert.equal(control.purgeRequest(), null);
    assert.equal(control.requested(), true, 'a build follows');
  });

  test('names the addresses the entry had once it is done, which the service takes out of its counts of addresses not found', async () => {
    const control = controlOf();
    control.askPurge({ id: 'p5', path: 'articles/aaaaaaaaaaaa.md' });
    await running(control, async () => ({ addresses: ['/the-meadow', '/old-meadow'] }));
    assert.deepEqual(control.purgeState(), { id: 'p5', state: 'done', at: '2026-11-26T10:00:00.000Z', addresses: ['/the-meadow', '/old-meadow'] });
  });

  test('waits for a build that runs to end before it starts', async () => {
    const control = controlOf();
    control.building(true);
    control.askPurge({ id: 'p2', path: 'articles/aaaaaaaaaaaa.md' });
    let looked = 0;
    let started = null;
    await running(control, async () => {
      started = looked;
      return {};
    }, {
      looks: 4,
      during: () => {
        looked += 1;
        if (looked === 2) control.building(false);
      },
    });
    assert.equal(started, 2, 'once the build had ended');
  });

  test('says why a purge was refused or broke, and lets the builds go on', async () => {
    const control = controlOf();
    control.askPurge({ id: 'p3', path: 'articles/aaaaaaaaaaaa.md' });
    await running(control, async () => {
      throw new PurgeRefusal('not-deleted');
    });
    assert.deepEqual(control.purgeState(), { id: 'p3', state: 'failed', reason: 'not-deleted', at: '2026-11-26T10:00:00.000Z' });
    control.askPurge({ id: 'p4', path: 'articles/aaaaaaaaaaaa.md' });
    await running(control, async () => {
      throw new Error('Forgejo answered 500');
    });
    assert.deepEqual(control.purgeState(), { id: 'p4', state: 'failed', reason: 'broke', at: '2026-11-26T10:00:00.000Z' });
    assert.equal(control.buildsHeld(), false);
  });

  test('says which current files hold a passage it was refused for, and how much a passage purge changed', async () => {
    const control = controlOf();
    control.askPurge({ id: 'p5', passage: 'Ebba Svensson' });
    await running(control, async () => {
      throw new PurgeRefusal('current', { paths: ['articles/aaaaaaaaaaaa.md'] });
    });
    assert.deepEqual(control.purgeState(), { id: 'p5', state: 'failed', reason: 'current', paths: ['articles/aaaaaaaaaaaa.md'], at: '2026-11-26T10:00:00.000Z' });
    control.askPurge({ id: 'p6', passage: 'Ebba Svensson' });
    await running(control, async () => ({ changed: { files: 2, revisions: 5, messages: 1 } }));
    assert.deepEqual(control.purgeState(), { id: 'p6', state: 'done', changed: { files: 2, revisions: 5, messages: 1 }, at: '2026-11-26T10:00:00.000Z' });
    assert.equal(control.purgeRequest(), null, 'nothing of the passage is left behind');
  });

  test('answers a search for a passage the service asks for, taking the request, and says one that broke', async () => {
    const control = controlOf();
    control.askSearch({ id: 's1', passage: 'Ebba Svensson' });
    const asked = [];
    await running(control, async () => assert.fail('no purge'), {
      search: async (request) => {
        asked.push({ request, held: control.buildsHeld() });
        return { files: [], messages: [], counted: { files: 0, revisions: 0, messages: 0 } };
      },
    });
    assert.deepEqual(asked, [{ request: { id: 's1', passage: 'Ebba Svensson' }, held: false }], 'a search holds no build back');
    assert.equal(control.searchRequest(), null);
    assert.deepEqual(control.searchAnswer(), { id: 's1', found: { files: [], messages: [], counted: { files: 0, revisions: 0, messages: 0 } } });
    control.askSearch({ id: 's2', passage: 'Ebba Svensson' });
    await running(control, async () => assert.fail('no purge'), {
      search: async () => {
        throw new Error('Forgejo answered 500');
      },
    });
    assert.deepEqual(control.searchAnswer(), { id: 's2', failed: true });
  });
});
