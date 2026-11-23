// The one dev server of a live preview shows one moment of the timeline at a time: what a page
// is asked for at waits until its content folder shows that moment, and the folder is made to
// show another only once nothing is being asked of the one it shows (ADR 0032).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { previewStage } from '../src/preview/stage.js';

const tick = (ms = 5) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

// A runner whose folder shows whichever moment it was last told to, and a dev server that takes
// a moment to have the change.
function made({ hold = 50, fails = () => false } = {}) {
  const log = [];
  let held = null;
  const runner = {
    shows: (moment) => held === (moment ?? 'now'),
    show: async (moment) => {
      if (fails(moment)) throw new Error('it broke');
      log.push(`show ${moment ?? 'now'}`);
      held = moment ?? 'now';
      return { changed: true };
    },
  };
  const dev = {
    changing: async (work) => {
      const outcome = await work();
      await tick();
      log.push('reloaded');
      return outcome;
    },
  };
  return { stage: previewStage({ runner, dev, hold }), log, runner };
}

// Work that says when it begins and ends, and ends when it is told to.
const work = (log, name) => {
  let end;
  const ended = new Promise((resolve) => {
    end = resolve;
  });
  return { run: async () => {
    log.push(`${name} begins`);
    await ended;
    log.push(`${name} ends`);
    return name;
  }, end };
};

describe('the stage', () => {
  test('shows a moment before anything is asked of it, and runs what is asked at once where it shows it', async () => {
    const { stage, log } = made();
    assert.equal(await stage.at(null, async () => 'a page'), 'a page');
    assert.deepEqual(log, ['show now', 'reloaded']);
    assert.equal(stage.ready(null), true);
    assert.equal(stage.ready('2099-01-01T00:00:00Z'), false);
    assert.equal(await stage.at(null, async () => 'another'), 'another');
    assert.deepEqual(log, ['show now', 'reloaded']);
  });

  test('runs what is asked of the moment it shows side by side, and shows another only once that is done', async () => {
    const { stage, log } = made();
    await stage.at(null, async () => {});
    log.length = 0;
    const one = work(log, 'one');
    const two = work(log, 'two');
    const later = work(log, 'later');
    const all = [stage.at(null, one.run), stage.at(null, two.run), stage.at('2099-01-01T00:00:00Z', later.run)];
    await tick();
    assert.deepEqual(log, ['one begins', 'two begins']);
    assert.equal(stage.ready(null), false, 'another moment waits');
    one.end();
    await tick();
    assert.deepEqual(log, ['one begins', 'two begins', 'one ends']);
    two.end();
    await tick(20);
    later.end();
    assert.deepEqual(await Promise.all(all), ['one', 'two', 'later']);
    assert.deepEqual(log, ['one begins', 'two begins', 'one ends', 'two ends', 'show 2099-01-01T00:00:00Z', 'reloaded', 'later begins', 'later ends']);
  });

  test('takes what is asked in turn, so that a moment asked for later waits for the one asked for first', async () => {
    const { stage, log } = made();
    await stage.at(null, async () => {});
    log.length = 0;
    const first = work(log, 'first');
    first.end();
    await Promise.all([stage.at('2099-01-01T00:00:00Z', first.run), stage.at(null, async () => log.push('now again'))]);
    assert.deepEqual(log, ['show 2099-01-01T00:00:00Z', 'reloaded', 'first begins', 'first ends', 'show now', 'reloaded', 'now again']);
  });

  // A page in a tab is not kept waiting: it says its moment is being prepared, and looks again.
  test('prepares a moment asked for, and holds it for a while for the page that will look again', async () => {
    const { stage, log } = made({ hold: 60 });
    await stage.at(null, async () => {});
    log.length = 0;
    stage.ask('2099-01-01T00:00:00Z');
    await tick(20);
    assert.equal(stage.ready('2099-01-01T00:00:00Z'), true);
    const meanwhile = stage.at(null, async () => log.push('now, after the hold'));
    await tick(10);
    assert.deepEqual(log, ['show 2099-01-01T00:00:00Z', 'reloaded']);
    assert.equal(await stage.at('2099-01-01T00:00:00Z', async () => 'the page'), 'the page');
    await meanwhile;
    assert.deepEqual(log, ['show 2099-01-01T00:00:00Z', 'reloaded', 'show now', 'reloaded', 'now, after the hold']);
  });

  test('a moment that cannot be shown fails what was asked of it, and the next goes on', async () => {
    const { stage } = made({ fails: (moment) => moment === '2099-01-01T00:00:00Z' });
    await assert.rejects(stage.at('2099-01-01T00:00:00Z', async () => 'never'), /it broke/);
    assert.equal(await stage.at(null, async () => 'now'), 'now');
  });

  test('a failing piece of work fails alone', async () => {
    const { stage } = made();
    await assert.rejects(stage.at(null, async () => {
      throw new Error('this page broke');
    }), /this page broke/);
    assert.equal(await stage.at(null, async () => 'next'), 'next');
  });
});
