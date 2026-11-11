// A form's submissions for Admins and Editors (ADR 0045), from the service in its role for
// editors, on the admin host: each form with how many it holds, a form's newest first, and a
// form's as CSV, against a stand-in for Forgejo that says who may write, and the service's own
// store, as the role for visitors keeps it.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { editorsService } from '../src/service/editors.js';
import { openStore } from '../src/service/store.js';
import { siteDescription } from '../src/site-description.js';

const contact = {
  label: 'Contact us',
  fields: [
    { name: 'name', label: 'Name', kind: 'text', required: true },
    { name: 'message', label: 'Message', kind: 'textarea', required: true },
    { name: 'copy', label: 'Keep me posted', kind: 'checkbox' },
    { name: 'interests', label: 'Interests', kind: 'checkboxes', options: ['Web', 'Print'] },
  ],
};
const note = { label: 'A note', fields: [{ name: 'note', label: 'Note', kind: 'textarea', required: true }] };
const type = { label: 'Note', plural: 'Notes', collection: 'notes', address: '/{slug}/', elements: ['paragraph', 'form'], fields: {} };
const site = siteDescription({ language: 'en_GB', types: { note: type }, forms: { contact, note } });

const MAY_WRITE = { authorization: 'token may-write' };

// A submission as the role for visitors keeps it.
const field = (name, label, value) => ({ name, label, value });
const sent = (at, fields, { form = 'contact', spam = null, language = 'en-GB' } = {}) => ({ form, sentAt: new Date(at), language, spam, fields });

describe('the submissions, for editors', () => {
  let folder;
  let store;
  let server;
  let origin;
  let asked;

  const get = (path, headers = MAY_WRITE) => fetch(`${origin}${path}`, { headers });

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-submissions-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  beforeEach(async () => {
    rmSync(join(folder, 'service.sqlite'), { force: true });
    store = openStore(join(folder, 'service.sqlite'));
    asked = [];
    const forgejo = async (url, { headers }) => {
      const { pathname } = new URL(url);
      asked.push({ path: pathname, authorization: headers.authorization });
      if (pathname !== '/api/v1/repos/org/source') throw new Error(`nothing to say of ${pathname}`);
      const known = ['token may-write', 'token may-read'].includes(headers.authorization);
      return { ok: known, status: known ? 200 : 401, json: async () => ({ permissions: { push: headers.authorization === 'token may-write' } }) };
    };
    const service = editorsService({ forgejo: 'http://forgejo', repository: 'org/source', token: 'read-token', control: buildControl(join(folder, 'control')), store, forms: () => site.forms, get: forgejo });
    server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((go) => server.close(go));
    store.close();
  });

  describe('each form', () => {
    test('is named with its label and how many it holds, the declared forms in their order, then any other the store holds, and spam is not counted', async () => {
      store.keep(sent('2026-11-01T10:00:00Z', [field('name', 'Name', 'Ada'), field('message', 'Message', 'Hello')]));
      store.keep(sent('2026-11-02T10:00:00Z', [field('name', 'Name', 'Bea'), field('message', 'Message', 'Hi')]));
      store.keep(sent('2026-11-03T10:00:00Z', [field('name', 'Name', 'Spam'), field('message', 'Message', 'Buy')], { spam: 'trap' }));
      store.keep(sent('2026-11-03T10:00:00Z', [field('topic', 'Topic', 'Old')], { form: 'retired' }));
      store.keep(sent('2026-11-03T10:00:00Z', [field('topic', 'Topic', 'Spam')], { form: 'only-spam', spam: 'too-soon' }));
      const answer = await get('/_konzilo/submissions');
      assert.equal(answer.status, 200);
      assert.equal(answer.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await answer.json(), {
        forms: [
          { name: 'contact', label: 'Contact us', count: 2 },
          { name: 'note', label: 'A note', count: 0 },
          { name: 'retired', label: 'retired', count: 1 },
        ],
      });
    });
  });

  describe('a form\'s submissions', () => {
    test('are newest first, each with its moment, its page\'s language and its fields as they came, and spam is not shown', async () => {
      store.keep(sent('2026-11-01T10:00:00Z', [field('name', 'Name', 'Ada'), field('message', 'Message', 'Hello\nagain'), field('copy', 'Keep me posted', true)]));
      store.keep(sent('2026-11-03T10:00:00Z', [field('name', 'Name', 'Spam'), field('message', 'Message', 'Buy')], { spam: 'trap' }));
      store.keep(sent('2026-11-02T10:00:00Z', [field('name', 'Your name', 'Bea'), field('interests', 'Interests', ['Web', 'Print'])], { language: 'sv-SE' }));
      store.keep(sent('2026-11-02T11:00:00Z', [field('note', 'Note', 'Elsewhere')], { form: 'note' }));
      const answer = await get('/_konzilo/submissions/contact');
      assert.equal(answer.status, 200);
      assert.equal(answer.headers.get('cache-control'), 'no-store');
      const { submissions, more } = await answer.json();
      assert.equal(more, false);
      assert.deepEqual(submissions.map(({ id, ...rest }) => {
        assert.ok(Number.isSafeInteger(id));
        return rest;
      }), [
        { sentAt: '2026-11-02T10:00:00.000Z', language: 'sv-SE', fields: [field('name', 'Your name', 'Bea'), field('interests', 'Interests', ['Web', 'Print'])] },
        { sentAt: '2026-11-01T10:00:00.000Z', language: 'en-GB', fields: [field('name', 'Name', 'Ada'), field('message', 'Message', 'Hello\nagain'), field('copy', 'Keep me posted', true)] },
      ]);
    });

    test('come a page at a time, the next from before the last one shown', async () => {
      for (let number = 0; number < 52; number += 1) {
        store.keep(sent(new Date(Date.UTC(2026, 10, 1, 10, 0, number)), [field('name', 'Name', `Number ${number}`)]));
      }
      const names = ({ submissions }) => submissions.map(({ fields }) => fields[0].value);
      const first = await (await get('/_konzilo/submissions/contact')).json();
      assert.equal(first.submissions.length, 50);
      assert.equal(first.more, true);
      assert.deepEqual(names(first).slice(0, 2), ['Number 51', 'Number 50']);
      const next = await (await get(`/_konzilo/submissions/contact?before=${first.submissions.at(-1).id}`)).json();
      assert.deepEqual(names(next), ['Number 1', 'Number 0']);
      assert.equal(next.more, false);
      assert.equal((await get('/_konzilo/submissions/contact?before=soon')).status, 400);
    });

    test('of a form the site declares and none was sent to are none, and of a form neither declared nor kept are not found', async () => {
      store.keep(sent('2026-11-01T10:00:00Z', [field('topic', 'Topic', 'Old')], { form: 'retired' }));
      assert.deepEqual(await (await get('/_konzilo/submissions/note')).json(), { submissions: [], more: false });
      assert.equal((await (await get('/_konzilo/submissions/retired')).json()).submissions.length, 1);
      assert.equal((await get('/_konzilo/submissions/no-such-form')).status, 404);
      assert.equal((await get('/_konzilo/submissions/contact/more')).status, 404);
      assert.equal((await fetch(`${origin}/_konzilo/submissions/contact`, { method: 'DELETE', headers: MAY_WRITE })).status, 405);
    });
  });

  describe('a form\'s submissions as CSV', () => {
    const csv = async (query) => {
      const answer = await get(`/_konzilo/submissions/contact.csv?${query}`);
      assert.equal(answer.status, 200, query);
      return { headers: answer.headers, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(await answer.arrayBuffer()) };
    };
    const keepTwoAndSpam = () => {
      store.keep(sent('2026-11-01T10:00:00Z', [field('name', 'Name', 'Ada'), field('phone', 'Phone', '+46 70 123'), field('message', 'Message', 'Hello\nagain'), field('copy', 'Keep me posted', true), field('interests', 'Interests', ['Web', 'Print'])]));
      store.keep(sent('2026-11-02T23:30:00Z', [field('name', 'Your name', 'Bea'), field('message', 'Message', 'Hi'), field('copy', 'Keep me posted', false)]));
      store.keep(sent('2026-11-04T10:00:00Z', [field('name', 'Your name', 'Spam'), field('message', 'Message', 'Buy')], { spam: 'trap' }));
      store.keep(sent('2026-11-03T10:00:00Z', [field('note', 'Note', 'Elsewhere')], { form: 'note' }));
    };

    test('is UTF-8 with a byte-order mark, its rows ended by CRLF, newest first, its columns the moment in the reader\'s time zone, the form, then the newest submission\'s labels in order and then each only older ones hold, and spam left out', async () => {
      keepTwoAndSpam();
      const { headers, text } = await csv('separator=comma&timeZone=Europe/Stockholm&language=en');
      assert.equal(headers.get('content-type'), 'text/csv; charset=utf-8; header=present');
      assert.equal(headers.get('content-disposition'), 'attachment; filename="contact.csv"');
      assert.equal(headers.get('cache-control'), 'no-store');
      assert.equal(headers.get('x-content-type-options'), 'nosniff');
      assert.equal(text, [
        '﻿Sent at,Form,Your name,Message,Keep me posted,Name,Phone,Interests',
        '2026-11-03 00:30:00,Contact us,Bea,Hi,No,,,',
        '2026-11-01 11:00:00,Contact us,,"Hello\nagain",Yes,Ada,\'+46 70 123,"Web, Print"',
        '',
      ].join('\r\n'));
    });

    test('takes semicolons, and its words in the reader\'s interface language, in UTC where the reader names no time zone the service knows', async () => {
      keepTwoAndSpam();
      const expected = [
        '﻿Skickat;Formulär;Your name;Message;Keep me posted;Name;Phone;Interests',
        '2026-11-02 23:30:00;Contact us;Bea;Hi;Nej;;;',
        '2026-11-01 10:00:00;Contact us;;"Hello\nagain";Ja;Ada;\'+46 70 123;Web, Print',
        '',
      ].join('\r\n');
      assert.equal((await csv('separator=semicolon&language=sv')).text, expected);
      assert.equal((await csv('separator=semicolon&language=sv&timeZone=Mars/Olympus')).text, expected);
      assert.match((await csv('separator=comma&language=de')).text, /^﻿Sent at,Form,/, 'British English for a language without a catalogue');
      assert.equal((await get('/_konzilo/submissions/contact.csv?separator=tab')).status, 400);
      assert.equal((await get('/_konzilo/submissions/contact.csv')).status, 400);
    });

    test('has a column for each field of a label two fields share in one submission, and names a form the site no longer declares by its name', async () => {
      store.keep(sent('2026-11-01T10:00:00Z', [field('first', 'Name', 'Ada'), field('last', 'Name', 'Lovelace')]));
      store.keep(sent('2026-11-01T10:00:00Z', [field('topic', 'Topic', 'Old')], { form: 'retired' }));
      assert.equal((await csv('separator=comma')).text, '﻿Sent at,Form,Name,Name\r\n2026-11-01 10:00:00,Contact us,Ada,Lovelace\r\n');
      assert.equal(new TextDecoder().decode(await (await get('/_konzilo/submissions/retired.csv?separator=comma')).arrayBuffer()), 'Sent at,Form,Topic\r\n2026-11-01 10:00:00,retired,Old\r\n');
      assert.equal(new TextDecoder().decode(await (await get('/_konzilo/submissions/note.csv?separator=comma')).arrayBuffer()), 'Sent at,Form\r\n', 'a declared form none was sent to');
      assert.equal((await get('/_konzilo/submissions/no-such-form.csv?separator=comma')).status, 404);
    });

    // What a spreadsheet would take as a formula, at the start of a cell.
    const FORMULA = /^[=+\-@\t\r]/;
    const risky = {
      equals: '=1+1', plus: '+1', minus: '-1', at: '@SUM(A1)', tab: '\tx', carriageReturn: '\rx',
      afterComma: 'a,=1+1', afterSemicolon: 'a;=1+1', afterLineBreak: 'a\n=1+1', quoteAfterComma: 'a,"b', minusAfterSemicolon: 'a;-b',
      inside: 'a = b', plain: 'plain',
    };

    test('writes a value that begins with =, +, -, @, a tab or a carriage return after an apostrophe, and such a character, or a quote, after a comma, a semicolon or a line break inside a value', async () => {
      store.keep(sent('2026-11-01T10:00:00Z', Object.entries(risky).map(([name, value]) => field(name.toLowerCase(), name, value))));
      assert.equal((await csv('separator=comma')).text.split('\r\n').slice(1).join('\r\n'), [
        `2026-11-01 10:00:00,Contact us,'=1+1,'+1,'-1,'@SUM(A1),'\tx,"'\rx","a,'=1+1",a;'=1+1,"a\n'=1+1","a,'""b",a;'-b,a = b,plain`,
        '',
      ].join('\r\n'));
      assert.equal((await csv('separator=semicolon')).text.split('\r\n').slice(1).join('\r\n'), [
        `2026-11-01 10:00:00;Contact us;'=1+1;'+1;'-1;'@SUM(A1);'\tx;"'\rx";a,'=1+1;"a;'=1+1";"a\n'=1+1";"a,'""b";"a;'-b";a = b;plain`,
        '',
      ].join('\r\n'));
    });

    // A file as a spreadsheet reads it by `separator`: a cell that starts with a quote runs to the
    // next lone quote, with a doubled quote in it one, and a quote anywhere else is a character;
    // a row ends at a line break outside quotes.
    const readAs = (text, separator) => {
      const rows = [];
      let row = [];
      let cell = '';
      let quoted = false;
      let fresh = true;
      const endCell = () => {
        row.push(cell);
        cell = '';
        fresh = true;
      };
      for (let at = text.startsWith('﻿') ? 1 : 0; at < text.length; at += 1) {
        const char = text[at];
        if (quoted) {
          if (char === '"' && text[at + 1] === '"') {
            cell += '"';
            at += 1;
          } else if (char === '"') quoted = false;
          else cell += char;
        } else if (fresh && char === '"') {
          quoted = true;
          fresh = false;
        } else if (char === separator) endCell();
        else if (char === '\n' || char === '\r') {
          if (char === '\r' && text[at + 1] === '\n') at += 1;
          endCell();
          rows.push(row);
          row = [];
        } else {
          cell += char;
          fresh = false;
        }
      }
      return rows;
    };

    test('opens with its columns by the separator it was written with, and with no cell that starts a formula by either', async () => {
      store.keep(sent('2026-11-01T10:00:00Z', Object.entries(risky).map(([name, value]) => field(name.toLowerCase(), name, value))));
      for (const [written, separator] of [['comma', ','], ['semicolon', ';']]) {
        const { text } = await csv(`separator=${written}`);
        const [header, row, ...rest] = readAs(text, separator);
        assert.deepEqual(rest, []);
        assert.deepEqual(header, ['Sent at', 'Form', ...Object.keys(risky)]);
        assert.deepEqual(row.slice(2).map((cell) => cell.replace(/(^|[,;\r\n])'/g, '$1')), Object.values(risky), written);
        for (const other of [',', ';']) {
          for (const cell of readAs(text, other).flat()) assert.doesNotMatch(cell, FORMULA, `${written} read by ${other}: ${JSON.stringify(cell)}`);
        }
      }
    });
  });

  describe('whoever may not write', () => {
    test('is told nothing, not even which forms there are, asking Forgejo each time', async () => {
      store.keep(sent('2026-11-01T10:00:00Z', [field('name', 'Name', 'Ada'), field('message', 'Message', 'Hello')]));
      for (const path of ['/_konzilo/submissions', '/_konzilo/submissions/contact', '/_konzilo/submissions/contact.csv', '/_konzilo/submissions/no-such-form']) {
        for (const headers of [{}, { authorization: 'nonsense' }, { authorization: 'token someone-else' }, { authorization: 'token may-read' }]) {
          const answer = await get(path, headers);
          assert.equal(answer.status, 401, `${path} ${JSON.stringify(headers)}`);
          assert.deepEqual(await answer.json(), {});
        }
      }
      assert.equal(asked.length, 8, 'each time there is a credential to ask about');
    });
  });
});
