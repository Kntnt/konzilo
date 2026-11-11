// The service, in its role for visitors (ADR 0044): a site's forms taken at /_konzilo/forms/<form>
// (ADR 0045), as the web server passes a request on, with what is kept read back from the
// service's store. The page's own script is proved in form-component.test.js, and the two meet in
// a real browser in the Compose acceptance suite.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';

import { openStore } from '../src/service/store.js';
import { visitorsService } from '../src/service/visitors.js';
import { siteDescription } from '../src/site-description.js';

const HOST = 'www.example.com';
const SITE = `https://${HOST}`;

// A form with a field of each kind.
const contact = {
  label: 'Contact us',
  fields: [
    { name: 'name', label: 'Your name', kind: 'text', required: true, maxLength: 20 },
    { name: 'email', label: 'Email', kind: 'email', required: true },
    { name: 'phone', label: 'Phone', kind: 'tel' },
    { name: 'message', label: 'Message', kind: 'textarea', required: true },
    { name: 'topic', label: 'Topic', kind: 'select', options: ['Sales', 'Support'] },
    { name: 'reach', label: 'Reach me by', kind: 'radio', options: ['Email', 'Phone'] },
    { name: 'copy', label: 'Keep me posted', kind: 'checkbox' },
    { name: 'interests', label: 'Interests', kind: 'checkboxes', options: ['Web', 'Print'] },
    { name: 'privacy', label: 'I have read the privacy policy', kind: 'acceptance' },
  ],
};
const note = { label: 'A note', fields: [{ name: 'note', label: 'Note', kind: 'textarea', required: true }] };
const type = { label: 'Note', plural: 'Notes', collection: 'notes', address: '/{slug}/', elements: ['paragraph', 'form'], fields: {} };
const described = (more = {}) => siteDescription({ language: 'en_GB', types: { note: type }, forms: { contact, note }, ...more });

// What a visitor fills in, as the page's script sends it.
const filledIn = { name: 'Ada Lovelace', email: 'ada@example.com', phone: '', message: 'Hello, I would like a quote.', topic: 'Sales', reach: 'Email', copy: true, interests: ['Web'], privacy: true };

// A request as the web server passes it on (ADR 0044): its method, path, query and body with its
// type, `Origin`, `Referer` and `Sec-Fetch-Site` as the browser sent them, and the visitor's address
// and the host it came to in headers of the web server's own. Gives { status, headers, body, json }.
function send(origin, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const asked = request(new URL(path, origin), { method, headers, agent: false }, (answer) => {
      const chunks = [];
      answer.on('data', (chunk) => chunks.push(chunk));
      answer.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          // Not JSON.
        }
        resolve({ status: answer.statusCode, headers: answer.headers, body: text, json });
      });
    });
    asked.on('error', reject);
    asked.end(body);
  });
}

describe('the service, for visitors', () => {
  let folder;
  let store;
  let server;
  let origin;
  let clock;
  let site;

  // The clock moves on by `seconds`.
  const later = (seconds) => {
    clock = new Date(clock.getTime() + seconds * 1000);
  };

  // Where a browser on a page of the site says a request came from, and the web server's own
  // headers, from the visitor at `address`.
  const fromThePage = (address = '192.0.2.7') => ({ 'Sec-Fetch-Site': 'same-origin', Origin: SITE, 'X-Konzilo-Client': address, 'X-Konzilo-Host': HOST });

  const tokenFor = async (form, headers = fromThePage()) => {
    const answer = await send(origin, 'GET', `/_konzilo/forms/${form}/token`, { headers: { ...headers, Accept: 'application/json' } });
    assert.equal(answer.status, 200, answer.body);
    return answer.json.token;
  };

  // A form sent by the page's script: as JSON, with a token asked for when the form came into use,
  // a while before.
  const sendJson = async (form, fields, { headers = fromThePage(), token = undefined, page = '/contact/' } = {}) => {
    const given = token === undefined ? await tokenFor(form, headers) : token;
    if (token === undefined) later(10);
    const body = JSON.stringify({ _page: page, _website: '', ...(given === null ? {} : { _token: given }), ...fields });
    return send(origin, 'POST', `/_konzilo/forms/${form}`, { headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' }, body });
  };

  // What the store holds of a form, newest first, each without the number it was kept by.
  const kept = (form = 'contact') => store.submissions(form).map(({ id, ...submission }) => {
    assert.ok(Number.isSafeInteger(id) && id > 0);
    return submission;
  });

  const start = async () => {
    store = openStore(join(folder, 'service.sqlite'));
    const service = visitorsService({ site: () => site, store, hosts: [HOST], now: () => clock });
    server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    origin = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    server.closeAllConnections();
    await new Promise((go) => server.close(go));
    store.close();
  };

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-visitors-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  beforeEach(async () => {
    rmSync(join(folder, 'service.sqlite'), { force: true });
    clock = new Date('2026-11-11T10:00:00Z');
    site = described();
    await start();
  });
  afterEach(stop);

  describe('a form sent with JavaScript', () => {
    test('is kept with each field\'s label as it came, the page\'s language and the moment, and answered as sent', async () => {
      const answer = await sendJson('contact', filledIn);

      assert.equal(answer.status, 200, answer.body);
      assert.deepEqual(answer.json, { outcome: 'sent' });
      assert.deepEqual(kept(), [{
        form: 'contact',
        sentAt: '2026-11-11T10:00:10.000Z',
        language: 'en-GB',
        spam: null,
        fields: [
          { name: 'name', label: 'Your name', value: 'Ada Lovelace' },
          { name: 'email', label: 'Email', value: 'ada@example.com' },
          { name: 'phone', label: 'Phone', value: '' },
          { name: 'message', label: 'Message', value: 'Hello, I would like a quote.' },
          { name: 'topic', label: 'Topic', value: 'Sales' },
          { name: 'reach', label: 'Reach me by', value: 'Email' },
          { name: 'copy', label: 'Keep me posted', value: true },
          { name: 'interests', label: 'Interests', value: ['Web'] },
          { name: 'privacy', label: 'I have read the privacy policy', value: true },
        ],
      }]);
    });

    test('notes the language of the page it was sent from, on a site in several', async () => {
      site = described({ language: undefined, languages: ['sv_SE', 'en_GB'] });
      await sendJson('note', { note: 'Hej' }, { page: '/sv/kontakt/' });
      await sendJson('note', { note: 'Hello' }, { page: '/en/contact/?from=menu' });
      await sendJson('note', { note: 'From the root' }, { page: '/' });

      assert.deepEqual(kept('note').map(({ language, fields }) => [language, fields[0].value]), [['sv-SE', 'From the root'], ['en-GB', 'Hello'], ['sv-SE', 'Hej']]);
    });

    test('names each wrong field by the problem the page shows beside it, and keeps nothing', async () => {
      const wrong = {
        name: '   ',
        email: 'ada@example',
        phone: 'call me',
        message: 'Hello',
        topic: 'Gardening',
        reach: 'Pigeon',
        interests: ['Web', 'Radio'],
        privacy: false,
      };
      const answer = await sendJson('contact', wrong);

      assert.equal(answer.status, 400);
      assert.deepEqual(answer.json, {
        outcome: 'invalid',
        fields: { name: 'missing', email: 'not-email', phone: 'not-tel', topic: 'not-an-option', reach: 'not-an-option', interests: 'not-an-option', privacy: 'missing' },
      });
      assert.deepEqual(kept(), []);
    });

    test('refuses a text longer than its field takes, in characters, a required field left out, and a value of another kind than its field\'s', async () => {
      const long = await sendJson('contact', { ...filledIn, name: 'Å'.repeat(21) });
      assert.deepEqual(long.json, { outcome: 'invalid', fields: { name: 'too-long' } });
      assert.equal((await sendJson('contact', { ...filledIn, name: '😀'.repeat(20) })).json.outcome, 'sent', 'twenty characters, each two units of UTF-16');

      const { message, ...without } = filledIn;
      assert.deepEqual((await sendJson('contact', without)).json, { outcome: 'invalid', fields: { message: 'missing' } });

      const odd = await sendJson('contact', { ...filledIn, name: 42, copy: 'yes', interests: 'Web', topic: ['Sales'] });
      assert.deepEqual(odd.json, { outcome: 'invalid', fields: { name: 'malformed', topic: 'malformed', copy: 'malformed', interests: 'malformed' } });
      assert.equal(kept().length, 1);
    });
  });

  describe('a form sent without JavaScript', () => {
    // A form as a browser posts it in its own encoding, with no token, which only the page's
    // script asks for.
    const post = (form, fields, { headers = fromThePage(), page = '/contact/' } = {}) => {
      const body = new URLSearchParams([['_page', page], ['_website', ''], ...fields]).toString();
      return send(origin, 'POST', `/_konzilo/forms/${form}`, { headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    };
    const ledBackTo = (answer) => {
      assert.equal(answer.status, 303, answer.body);
      return answer.headers.location;
    };

    test('is kept, a box ticked as a yes and one left as a no, and leads the browser back to the page with the outcome in the fragment', async () => {
      const answer = await post('contact', [['name', 'Ada'], ['email', 'ada@example.com'], ['phone', ''], ['message', 'Line one\r\nLine two'], ['topic', 'Support'], ['interests', 'Web'], ['interests', 'Print'], ['privacy', 'on']]);

      assert.equal(ledBackTo(answer), '/contact/#konzilo-form-contact-sent');
      assert.equal(answer.headers['cache-control'], 'no-store');
      assert.equal(answer.headers['set-cookie'], undefined);
      const [{ fields, spam }] = kept();
      assert.equal(spam, null);
      assert.deepEqual(Object.fromEntries(fields.map(({ name, value }) => [name, value])), {
        name: 'Ada',
        email: 'ada@example.com',
        phone: '',
        message: 'Line one\nLine two',
        topic: 'Support',
        reach: '',
        copy: false,
        interests: ['Web', 'Print'],
        privacy: true,
      });
    });

    test('leads the browser back to the page it came from, with its query, and to the site\'s root from a page that is no path of the site\'s', async () => {
      assert.equal(ledBackTo(await post('note', [['note', 'One']], { page: '/a/b/?from=menu' })), '/a/b/?from=menu#konzilo-form-note-sent');
      for (const page of ['https://elsewhere.example/', '//elsewhere.example/', '/\\elsewhere.example/', 'nowhere', '/with space/', '/köp/€/', '/line\nbreak/']) {
        assert.equal(ledBackTo(await post('note', [['note', 'One']], { page })), '/#konzilo-form-note-sent', page);
      }
    });

    test('leads the browser back to the fields\' outcome when one is wrong, a field given twice among them, and keeps nothing', async () => {
      assert.equal(ledBackTo(await post('note', [['note', '']])), '/contact/#konzilo-form-note-invalid');
      assert.equal(ledBackTo(await post('note', [['note', 'One'], ['note', 'Two']])), '/contact/#konzilo-form-note-invalid');
      assert.deepEqual(kept('note'), []);
    });
  });
});
