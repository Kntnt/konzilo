// The editor's keeper of a tab's lock (ADR 0073), against a stand-in for the service: it holds the
// form the tab has open, says who holds it where another tab does, takes it over when asked, turns
// the form read-only when it is taken over, and checks the lock before a save and a deletion.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { formOf, lockKeeper } from '../src/cms/lock/keeper.js';

const EBBA = { name: 'Ebba Editor', since: '2026-11-23T10:00:00.000Z', yours: false };

// A service that answers as `held` says: each form's holder, by form, or `mine` for this tab's.
const standIn = ({ held = {}, adminOnly = [], fromFeed = [], down = false, shut = false } = {}) => {
  const asked = [];
  const service = {
    asked,
    held,
    shut,
    async hold(form, { takeOver = false } = {}) {
      asked.push(['hold', form, takeOver]);
      if (down) return null;
      if (service.shut && held[form] !== 'mine') return { shut: true };
      if (adminOnly.includes(form.split('/')[0])) return { adminOnly: true };
      if (fromFeed.includes(form)) return { fromFeed: true };
      if (held[form] && held[form] !== 'mine' && !takeOver) return { holder: held[form] };
      held[form] = 'mine';
      return { held: true, since: '2026-11-23T10:05:00.000Z' };
    },
    async release(form) {
      asked.push(['release', form]);
      if (held[form] === 'mine') delete held[form];
    },
  };
  return service;
};

const keeping = (options) => {
  const service = standIn(options);
  const shown = [];
  const marked = [];
  const told = [];
  const keeper = lockKeeper({ service, show: (state) => shown.push(state), mark: (marks) => marked.push(marks), purged: (news) => told.push(news) });
  return { service, keeper, shown, marked, told, last: () => shown.at(-1) };
};

describe('the keeper of a tab\'s lock', () => {
  test('names the form an address of the editor opens, and none for a new entry or a list', () => {
    assert.equal(formOf('#/collections/articles/entries/aaaaaaaaaaaa'), 'articles/aaaaaaaaaaaa');
    assert.equal(formOf('#/collections/menus/entries/main-en?locale=en'), 'menus/main-en');
    assert.equal(formOf('#/collections/articles/entries/%C3%A5r'), 'articles/år');
    assert.equal(formOf('#/collections/articles/new'), null);
    assert.equal(formOf('#/collections/articles'), null);
    assert.equal(formOf(''), null);
  });

  test('holds a free form as it opens, and lets it go as it is left', async () => {
    const { keeper, service, last } = keeping();
    await keeper.open('articles/aaaaaaaaaaaa');
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'editing' });
    assert.equal(service.held['articles/aaaaaaaaaaaa'], 'mine');
    await keeper.open(null);
    assert.deepEqual(last(), { form: null, mode: 'none' });
    assert.equal(service.held['articles/aaaaaaaaaaaa'], undefined);
  });

  test('asks what to do with a form another tab holds, read-only meanwhile, and reads it or takes it over as chosen', async () => {
    const { keeper, service, last } = keeping({ held: { 'articles/aaaaaaaaaaaa': EBBA } });
    await keeper.open('articles/aaaaaaaaaaaa');
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'asking', holder: EBBA });
    assert.equal(keeper.readOnly(), true);
    keeper.read();
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'reading', holder: EBBA });
    assert.equal(keeper.readOnly(), true);
    await keeper.takeOver();
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'editing' });
    assert.deepEqual(service.asked.at(-1), ['hold', 'articles/aaaaaaaaaaaa', true]);
    assert.equal(keeper.readOnly(), false);
  });

  test('turns the form read-only at once when the locks say another tab has taken it over, naming who and when', async () => {
    const { keeper, last } = keeping();
    await keeper.open('articles/aaaaaaaaaaaa');
    await keeper.seen({ version: 2, locks: [{ form: 'articles/aaaaaaaaaaaa', name: 'Anna Admin', since: '2026-11-23T10:07:00.000Z', mine: false, yours: false }] });
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'takenOver', holder: { name: 'Anna Admin', since: '2026-11-23T10:07:00.000Z', yours: false } });
    assert.equal(keeper.readOnly(), true);
  });

  test('takes its own lock back where the service has forgotten it and no one else holds it', async () => {
    const { keeper, service, last } = keeping();
    await keeper.open('articles/aaaaaaaaaaaa');
    delete service.held['articles/aaaaaaaaaaaa'];
    await keeper.seen({ version: 7, locks: [] });
    assert.equal(service.held['articles/aaaaaaaaaaaa'], 'mine');
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'editing' });
  });

  test('follows the holder of a form it reads, and says when no one holds it', async () => {
    const { keeper, last } = keeping({ held: { 'articles/aaaaaaaaaaaa': EBBA } });
    await keeper.open('articles/aaaaaaaaaaaa');
    keeper.read();
    await keeper.seen({ version: 3, locks: [] });
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'reading', holder: null });
  });

  test('marks each form another tab holds, by its holder, for the list', async () => {
    const { keeper, marked } = keeping();
    await keeper.seen({
      version: 2,
      locks: [
        { form: 'articles/aaaaaaaaaaaa', name: 'Ebba Editor', since: '2026-11-23T10:00:00.000Z', mine: false, yours: false },
        { form: 'articles/bbbbbbbbbbbb', name: 'Anna Admin', since: '2026-11-23T10:00:00.000Z', mine: false, yours: true },
        { form: 'articles/cccccccccccc', name: 'Anna Admin', since: '2026-11-23T10:00:00.000Z', mine: true, yours: true },
      ],
    });
    assert.deepEqual(marked.at(-1), {
      'articles/aaaaaaaaaaaa': { name: 'Ebba Editor', yours: false },
      'articles/bbbbbbbbbbbb': { name: 'Anna Admin', yours: true },
    });
  });

  test('lets go a lock the tab holds for no form it has open', async () => {
    const { keeper, service } = keeping({ held: { 'articles/cccccccccccc': 'mine' } });
    await keeper.seen({ version: 2, locks: [{ form: 'articles/cccccccccccc', name: 'Anna Admin', since: '2026-11-23T10:00:00.000Z', mine: true, yours: true }] });
    assert.deepEqual(service.asked, [['release', 'articles/cccccccccccc']]);
  });

  test('opens an Admin\'s form read-only to an Editor, with no takeover', async () => {
    const { keeper, last } = keeping({ adminOnly: ['settings'] });
    await keeper.open('settings/settings');
    assert.deepEqual(last(), { form: 'settings/settings', mode: 'adminOnly' });
    assert.equal(keeper.readOnly(), true);
    await keeper.takeOver();
    assert.deepEqual(last(), { form: 'settings/settings', mode: 'adminOnly' });
  });

  test('opens a post made from a feed read-only to everyone, with no takeover, no save and no deletion (ADR 0079)', async () => {
    const { keeper, last } = keeping({ fromFeed: ['articles/f00d00000001'] });
    await keeper.open('articles/f00d00000001');
    assert.deepEqual(last(), { form: 'articles/f00d00000001', mode: 'fromFeed' });
    assert.equal(keeper.readOnly(), true);
    await keeper.takeOver();
    assert.deepEqual(last(), { form: 'articles/f00d00000001', mode: 'fromFeed' });
    assert.deepEqual(await keeper.beforeSave(), { name: 'lock.refusedReadOnly' });
    assert.deepEqual(keeper.toLetGo(), []);
    await keeper.open(null);
    assert.deepEqual(await keeper.beforeDeleting(['articles/f00d00000001']), { refusal: { name: 'lock.refusedFeed' } });
  });

  test('lets a save through while the tab holds the lock, and refuses it, naming who took it, once it does not', async () => {
    const { keeper, service, last } = keeping();
    assert.equal(await keeper.beforeSave(), null, 'a new entry has no lock to keep');
    await keeper.open('articles/aaaaaaaaaaaa');
    assert.equal(await keeper.beforeSave(), null);
    service.held['articles/aaaaaaaaaaaa'] = { name: 'Anna Admin', since: '2026-11-23T10:09:00.000Z', yours: false };
    assert.deepEqual(await keeper.beforeSave(), { name: 'lock.refusedTakenOver', values: { name: 'Anna Admin', at: { moment: '2026-11-23T10:09:00.000Z' } } });
    assert.equal(last().mode, 'takenOver');
    assert.deepEqual(await keeper.beforeSave(), { name: 'lock.refusedReadOnly' });
  });

  test('lets a save through where the service does not answer, since the latest save is still checked', async () => {
    const { keeper } = keeping({ down: true });
    await keeper.open('articles/aaaaaaaaaaaa');
    assert.equal(await keeper.beforeSave(), null);
  });

  test('deletes from the list only what no other tab holds, holding it meanwhile, and from the form only with its lock', async () => {
    const { keeper, service } = keeping({ held: { 'articles/aaaaaaaaaaaa': EBBA, 'articles/bbbbbbbbbbbb': { ...EBBA, yours: true } } });
    assert.deepEqual(await keeper.beforeDeleting(['articles/cccccccccccc', 'articles/aaaaaaaaaaaa']), { refusal: { name: 'lock.refusedDelete', values: { name: 'Ebba Editor' } } });
    assert.equal(service.held['articles/cccccccccccc'], undefined, 'nothing held for a deletion refused');
    assert.deepEqual(await keeper.beforeDeleting(['articles/bbbbbbbbbbbb']), { refusal: { name: 'lock.refusedDeleteYours' } });

    const allowed = await keeper.beforeDeleting(['articles/cccccccccccc']);
    assert.equal(allowed.refusal, undefined);
    assert.equal(service.held['articles/cccccccccccc'], 'mine');
    await allowed.done();
    assert.equal(service.held['articles/cccccccccccc'], undefined);

    await keeper.open('articles/dddddddddddd');
    const fromForm = await keeper.beforeDeleting(['articles/dddddddddddd']);
    assert.equal(fromForm.refusal, undefined);
    await fromForm.done();
    assert.equal(service.held['articles/dddddddddddd'], 'mine', 'the form keeps its own lock until it is left');
  });

  test('restores a deleted entry only where no other tab holds its form, holding it meanwhile, and keeps it as its form opens', async () => {
    const { keeper, service } = keeping({ held: { 'articles/aaaaaaaaaaaa': EBBA, 'articles/bbbbbbbbbbbb': { ...EBBA, yours: true } } });
    assert.deepEqual(await keeper.beforeRestoring('articles/aaaaaaaaaaaa'), { refusal: { name: 'lock.refusedRestore', values: { name: 'Ebba Editor' } } });
    assert.deepEqual(await keeper.beforeRestoring('articles/bbbbbbbbbbbb'), { refusal: { name: 'lock.refusedRestoreYours' } });

    const restoring = await keeper.beforeRestoring('articles/cccccccccccc');
    assert.equal(restoring.refusal, undefined);
    await keeper.seen({ locks: [{ form: 'articles/cccccccccccc', name: 'Anna Admin', mine: true, yours: true }] });
    assert.equal(service.held['articles/cccccccccccc'], 'mine', 'held while it is restored');
    await keeper.open('articles/cccccccccccc');
    await restoring.done();
    assert.equal(service.held['articles/cccccccccccc'], 'mine', 'the form opened keeps it');

    const left = await keeper.beforeRestoring('articles/dddddddddddd');
    await left.done();
    assert.equal(service.held['articles/dddddddddddd'], undefined, 'let go where its form was not opened');
  });

  test('shows a draft backup the entry was saved after read-only, until the latest is opened', async () => {
    const { keeper, last } = keeping();
    await keeper.open('articles/aaaaaaaaaaaa');
    keeper.staleBackup('2026-11-23T09:00:00.000Z');
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'staleBackup', at: '2026-11-23T09:00:00.000Z' });
    assert.equal(keeper.readOnly(), true);
    keeper.latest();
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'editing' });
  });

  test('keeps a form read-only until the service has answered, and lets the Editor work where it does not answer', async () => {
    const { keeper, service, last } = keeping();
    let answer;
    const hold = service.hold;
    service.hold = (...args) => new Promise((go) => {
      answer = () => go(hold(...args));
    });
    const opened = keeper.open('articles/aaaaaaaaaaaa');
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'checking' });
    assert.equal(keeper.readOnly(), true);
    let settled = false;
    const settling = keeper.settled().then(() => {
      settled = true;
    });
    await new Promise((go) => setImmediate(go));
    assert.equal(settled, false, 'not settled before the answer');
    answer();
    await opened;
    await settling;
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'editing' });

    const down = keeping({ down: true });
    await down.keeper.open('articles/aaaaaaaaaaaa');
    assert.deepEqual(down.last(), { form: 'articles/aaaaaaaaaaaa', mode: 'editing' });
    assert.equal(down.keeper.readOnly(), false);
  });

  test('shows a draft backup found while the service is asked read-only once the lock is the tab\'s', async () => {
    const { keeper, service, last } = keeping();
    let answer;
    const hold = service.hold;
    service.hold = (...args) => new Promise((go) => {
      answer = () => go(hold(...args));
    });
    const opened = keeper.open('articles/aaaaaaaaaaaa');
    keeper.staleBackup('2026-11-23T09:00:00.000Z');
    answer();
    await opened;
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'staleBackup', at: '2026-11-23T09:00:00.000Z' });
  });

  test('lets the lock go as the form is left from a draft backup that can no longer be saved', async () => {
    const { keeper, service } = keeping();
    await keeper.open('articles/aaaaaaaaaaaa');
    keeper.staleBackup('2026-11-23T09:00:00.000Z');
    assert.deepEqual(keeper.toLetGo(), ['articles/aaaaaaaaaaaa'], 'the page lets it go as it is closed');
    await keeper.open(null);
    assert.equal(service.held['articles/aaaaaaaaaaaa'], undefined);
    assert.deepEqual(keeper.toLetGo(), []);
  });

  test('names the forms whose locks the page lets go as it is closed, only where the tab holds them', async () => {
    const { keeper } = keeping({ held: { 'articles/aaaaaaaaaaaa': EBBA }, adminOnly: ['settings'] });
    assert.deepEqual(keeper.toLetGo(), []);
    await keeper.open('articles/bbbbbbbbbbbb');
    assert.deepEqual(keeper.toLetGo(), ['articles/bbbbbbbbbbbb']);
    await keeper.open('articles/aaaaaaaaaaaa');
    assert.deepEqual(keeper.toLetGo(), [], 'asking');
    keeper.read();
    assert.deepEqual(keeper.toLetGo(), [], 'reading');
    await keeper.open('settings/settings');
    assert.deepEqual(keeper.toLetGo(), [], 'an Admin\'s form');
  });

  test('names a form whose hold is still unanswered among those the page lets go as it is closed, though the tab has left it', async () => {
    const { keeper, service } = keeping();
    let answer;
    const hold = service.hold;
    service.hold = (...args) => new Promise((go) => {
      answer = () => go(hold(...args));
    });
    const opened = keeper.open('articles/aaaaaaaaaaaa');
    await keeper.open(null);
    assert.deepEqual(keeper.toLetGo(), ['articles/aaaaaaaaaaaa'], 'the service may hold it for the tab by now');
    answer();
    await opened;
    assert.deepEqual(keeper.toLetGo(), []);
    assert.equal(service.held['articles/aaaaaaaaaaaa'], undefined);
  });

  test('takes a form back from the tab that took it over with its unsaved changes set aside, to read and never to save', async () => {
    const { keeper, service, last } = keeping();
    await keeper.open('articles/aaaaaaaaaaaa');
    service.held['articles/aaaaaaaaaaaa'] = { name: 'Anna Admin', since: '2026-11-23T10:07:00.000Z', yours: false };
    await keeper.seen({ version: 2, locks: [{ form: 'articles/aaaaaaaaaaaa', name: 'Anna Admin', since: '2026-11-23T10:07:00.000Z', mine: false, yours: false }] });
    assert.equal(last().mode, 'takenOver');
    await keeper.takeOver();
    assert.equal(service.held['articles/aaaaaaaaaaaa'], 'mine');
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'staleBackup', at: '2026-11-23T10:07:00.000Z', takenOver: true });
    assert.equal(keeper.readOnly(), true);
    assert.deepEqual(await keeper.beforeSave(), { name: 'lock.refusedReadOnly' });
    keeper.latest();
    assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'editing' });
  });

  test('keeps a backup of a form another tab holds from showing over the question', async () => {
    const { keeper, last } = keeping({ held: { 'articles/aaaaaaaaaaaa': EBBA } });
    await keeper.open('articles/aaaaaaaaaaaa');
    keeper.staleBackup('2026-11-23T09:00:00.000Z');
    assert.equal(last().mode, 'asking');
  });

  describe('while an Admin\'s purge waits or runs (ADR 0078)', () => {
    test('opens no form, read-only with the way back, and opens it once the purge has ended otherwise than done', async () => {
      const { keeper, service, last, told } = keeping({ shut: true });
      await keeper.open('articles/aaaaaaaaaaaa');
      assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'shut' });
      assert.equal(keeper.readOnly(), true);
      await keeper.seen({ version: 2, locks: [], purge: { id: 'p1', state: 'waiting', reload: false } });
      assert.deepEqual(told.at(-1), 'shut');
      service.shut = false;
      await keeper.seen({ version: 3, locks: [], purge: null });
      assert.deepEqual(told.at(-1), 'open');
      assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'editing' }, 'a purge stopped while it waited');
    });

    test('refuses a save, a deletion and a restore where the forms are shut, and turns the form read-only', async () => {
      const { keeper, service, last } = keeping();
      await keeper.open('articles/aaaaaaaaaaaa');
      service.shut = true;
      delete service.held['articles/aaaaaaaaaaaa'];
      assert.deepEqual(await keeper.beforeSave(), { name: 'lock.refusedPurge' });
      assert.deepEqual(last(), { form: 'articles/aaaaaaaaaaaa', mode: 'shut' });
      assert.deepEqual((await keeper.beforeDeleting(['articles/bbbbbbbbbbbb'])).refusal, { name: 'lock.refusedPurge' });
      assert.deepEqual((await keeper.beforeRestoring('articles/cccccccccccc')).refusal, { name: 'lock.refusedPurge' });
    });

    test('tells a tab with a form open to reload where the purge runs anyway, and every tab that saw it coming to reload once it is done', async () => {
      const { keeper, told } = keeping();
      await keeper.seen({ version: 2, locks: [], purge: { id: 'p1', state: 'done' } });
      assert.deepEqual(told, ['open'], 'one done before the tab saw it is nothing to it');
      await keeper.seen({ version: 3, locks: [], purge: { id: 'p2', state: 'warning', reload: true } });
      assert.equal(told.at(-1), 'warn');
      await keeper.seen({ version: 4, locks: [], purge: { id: 'p2', state: 'running', reload: false } });
      assert.equal(told.at(-1), 'shut');
      await keeper.seen({ version: 5, locks: [], purge: { id: 'p2', state: 'done' } });
      assert.equal(told.at(-1), 'reload');
    });

    test('keeps the forms shut while a purge is unfinished, and reloads once it is finished', async () => {
      const { keeper, told } = keeping();
      await keeper.seen({ version: 2, locks: [], purge: { id: 'p3', state: 'unfinished', reload: false } });
      assert.equal(told.at(-1), 'shut');
      await keeper.seen({ version: 3, locks: [], purge: { id: 'p3', state: 'done' } });
      assert.equal(told.at(-1), 'reload');
    });
  });
});
