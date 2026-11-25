// The purge's program (ADR 0078): it takes the purge the service asks for, holds the builds back
// while it runs, once a build that runs has ended, says how it stands, and asks for a build once it
// is done, so that the release in use holds nothing of what it purged.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { PurgeRefusal } from '../src/purge/entry.js';
import { purgeOnRequest } from '../src/purge/program.js';

const folder = mkdtempSync(join(tmpdir(), 'konzilo-purge-program-'));
after(() => rmSync(folder, { recursive: true, force: true }));
let count = 0;
const controlOf = () => {
  count += 1;
  return buildControl(join(folder, String(count)));
};

// Runs the program until it has looked `looks` times with nothing to do.
const running = async (control, purge, { looks = 1, during = () => {} } = {}) => {
  let left = looks;
  await purgeOnRequest({
    control,
    purge,
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
});
