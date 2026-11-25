// A scheduled post's triggers in its form (ADR 0076): as the form holds them, beside the date a
// moment alone stays in, as each change makes them, and the checks at Save, a moment or a window
// passed, something left empty, and posts that wait for each other in a cycle.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addCondition, addTrigger, changeCondition, changeTrigger, cycleThrough, problemAtSave, removeCondition, removeTrigger, rowsIn, writtenFrom } from '../src/cms/schedule/model.js';

const NOW = '2026-11-25T10:00:00Z';
const LATER = '2026-12-01T09:00:00Z';
const launch = { published: [[{ words: 'launch' }]], since: '2026-11-20T10:00:00Z' };

describe('the triggers the form holds', () => {
  test('a moment alone is the date, as it always was, and other triggers are held without one', () => {
    assert.deepEqual(rowsIn({ date: '2026-12-01T09:00:00.000Z', triggers: '' }), [[{ moment: LATER }]]);
    assert.deepEqual(rowsIn({ date: '', triggers: [[launch]] }), [[launch]]);
    assert.deepEqual(rowsIn({ date: '', triggers: '' }), []);
    assert.deepEqual(writtenFrom([[{ moment: LATER }]]), { date: LATER, triggers: '' });
    assert.deepEqual(writtenFrom([[{ moment: LATER }, launch]]), { date: '', triggers: [[{ moment: LATER }, launch]] });
    assert.deepEqual(writtenFrom([]), { date: '', triggers: '' });
  });

  test('a trigger added beside the date takes it along, as an alternative on its row or on a row of its own', () => {
    const rows = rowsIn({ date: LATER, triggers: '' });
    assert.deepEqual(addTrigger(rows, 0, launch), [[{ moment: LATER }, launch]]);
    assert.deepEqual(addTrigger(rows, null, launch), [[{ moment: LATER }], [launch]]);
    assert.deepEqual(addTrigger([], null, launch), [[launch]]);
  });

  test('a trigger removed takes its row with it where the row is left empty, and the moment may go', () => {
    const rows = [[{ moment: LATER }, launch], [launch]];
    assert.deepEqual(removeTrigger(rows, 0, 0), [[launch], [launch]]);
    assert.deepEqual(removeTrigger(rows, 1, 0), [[{ moment: LATER }, launch]]);
    assert.deepEqual(writtenFrom(removeTrigger(removeTrigger(rows, 1, 0), 0, 1)), { date: LATER, triggers: '' }, 'and a moment left alone is the date again');
  });

  test('a changed trigger is replaced, and changed conditions count from now', () => {
    assert.deepEqual(changeTrigger([[launch]], 0, 0, { moment: LATER }), [[{ moment: LATER }]]);
    const conditions = launch.published;
    assert.deepEqual(addCondition(launch, 0, { type: 'story' }, NOW), { published: [[{ words: 'launch' }, { type: 'story' }]], since: NOW });
    assert.deepEqual(addCondition(launch, null, { type: 'story' }, NOW), { published: [[{ words: 'launch' }], [{ type: 'story' }]], since: NOW });
    assert.deepEqual(changeCondition(launch, 0, 0, { words: 'opening' }, NOW), { published: [[{ words: 'opening' }]], since: NOW });
    assert.deepEqual(removeCondition({ published: [...conditions, [{ type: 'story' }]], since: launch.since }, 1, 0, NOW), { published: conditions, since: NOW });
    assert.deepEqual(removeCondition(launch, 0, 0, NOW), { published: [], since: NOW }, 'a trigger with no condition is one to fill in');
  });
});

describe('the check at Save', () => {
  test('stops a moment that is not ahead, a window wholly passed, and what is left empty', () => {
    assert.equal(problemAtSave([[{ moment: LATER }, launch]], NOW), null);
    assert.equal(problemAtSave([], NOW), 'momentAhead', 'nothing to wait for is a moment missing, as it always was');
    assert.equal(problemAtSave([[{ moment: '2026-11-25T09:59:00Z' }, launch]], NOW), 'momentAhead');
    assert.equal(problemAtSave([[{ published: [[{ to: '2026-11-25T09:00:00Z' }]], since: NOW }]], NOW), 'windowPassed');
    assert.equal(problemAtSave([[{ published: [[{ from: '2026-11-01T00:00:00Z', to: LATER }]], since: NOW }]], NOW), null, 'a start already passed counts from the save');
    assert.equal(problemAtSave([[{ moment: '' }]], NOW), 'incomplete');
    assert.equal(problemAtSave([[{ published: [[{ words: ' ' }]], since: NOW }]], NOW), 'incomplete');
    assert.equal(problemAtSave([[{ published: [], since: NOW }]], NOW), 'incomplete');
    assert.equal(problemAtSave([[{ published: [[{}]], since: NOW }]], NOW), 'incomplete');
  });

  test('stops posts that wait for each other in a cycle, naming the post it runs through', () => {
    const own = { file: 'articles/aaaa.md', type: 'story', title: 'Opening night', terms: [], rows: [[{ published: [[{ words: 'programme' }]], since: NOW }]] };
    const programme = { file: 'articles/bbbb.md', type: 'story', title: 'The programme', terms: [], triggers: [[{ published: [[{ words: 'tickets' }]], since: NOW }]] };
    const tickets = { file: 'articles/cccc.md', type: 'story', title: 'Tickets', terms: [], triggers: [[{ published: [[{ words: 'opening' }]], since: NOW }]] };
    assert.equal(cycleThrough(own, [programme, tickets]), 'The programme');
    assert.equal(cycleThrough(own, [programme]), null);
    assert.equal(cycleThrough({ ...own, title: 'Closing night' }, [programme, tickets]), null);
    assert.equal(cycleThrough(own, [programme, { ...tickets, file: own.file }]), null, 'the post\'s own saved version is the form\'s');
    assert.equal(cycleThrough(own, [{ ...programme, triggers: [[{ moment: LATER }, programme.triggers[0][0]]] }, tickets]), null, 'a row with a moment on it comes to hold in time, whatever else it waits for');
    assert.equal(cycleThrough({ ...own, rows: [[{ moment: LATER }], own.rows[0]] }, [programme, tickets]), 'The programme', 'a row of posts alone waits for them');
  });
});

test('the date is out of sight while the triggers hold its moments, and the triggers while the post is not scheduled', async () => {
  const { hiddenBy } = await import('../src/cms/groups/menu.js');
  assert.equal(hiddenBy('scheduledByTriggers', { status: 'scheduled', date: '', triggers: [[launch]] }), true);
  assert.equal(hiddenBy('scheduledByTriggers', { status: 'scheduled', date: LATER, triggers: '' }), false);
  assert.equal(hiddenBy('scheduledByTriggers', { status: 'published', date: '', triggers: [[launch]] }), false);
  assert.equal(hiddenBy('notScheduled', { status: 'draft' }), true);
  assert.equal(hiddenBy('notScheduled', { status: 'scheduled' }), false);
  assert.equal(hiddenBy('no-such-rule', { status: 'draft' }), false);
});
