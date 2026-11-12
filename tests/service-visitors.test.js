// The service, in its role for visitors (ADR 0044): a site's forms taken at /_konzilo/forms/<form>
// (ADR 0045), as the web server passes a request on, with what is kept read back from the
// service's store. The page's own script is proved in form-component.test.js, and the two meet in
// a real browser in the Compose acceptance suite.

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';

import { submissionMail } from '../src/service/mail.js';
import { openStore } from '../src/service/store.js';
import { submissionsCsv } from '../src/service/submissions-csv.js';
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

    test('keeps a label\'s words without the links it holds, and its mail and its CSV show them so', async () => {
      const linked = { label: 'Join', fields: [
        { name: 'email', label: 'Email, as [we use it](/privacy-policy/#email)', kind: 'email', required: true },
        { name: 'privacy', label: 'I have read the [privacy policy](/privacy-policy/)', kind: 'acceptance' },
      ] };
      site = described({ forms: { contact, note, linked } });
      assert.equal((await sendJson('linked', { email: 'ada@example.com', privacy: true })).status, 200);

      const [submission] = store.submissions('linked');
      assert.deepEqual(submission.fields, [
        { name: 'email', label: 'Email, as we use it', value: 'ada@example.com' },
        { name: 'privacy', label: 'I have read the privacy policy', value: true },
      ]);
      const mail = submissionMail({ submission, form: site.forms.linked, sender: 'site@example.com', recipients: ['anna@example.com'] });
      assert.match(mail.text, /^Email, as we use it\nada@example\.com\n\nI have read the privacy policy\nYes\n$/m);
      assert.doesNotMatch(mail.text, /[[\]()]/);
      const csv = [...submissionsCsv({ labelOf: () => 'Join', each: () => [submission], separator: 'comma', timeZone: 'UTC', language: 'en' })].join('');
      assert.equal(csv.split('\r\n')[0], '\uFEFFSent at (UTC),Form,"Email, as we use it",I have read the privacy policy');
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

      site = described({ forms: { contact, note: { label: 'A note', fields: [{ name: 'constructor', label: 'Builder', kind: 'text' }, { name: 'tostring', label: 'Text', kind: 'text', required: true }] } } });
      const inherited = await sendJson('note', { tostring: 'Hello' });
      assert.deepEqual(inherited.json, { outcome: 'sent' }, 'a field named as what every object has, and left out');
      assert.deepEqual(kept('note')[0].fields.map(({ value }) => value), ['', 'Hello']);

      const odd = await sendJson('contact', { ...filledIn, name: 42, copy: 'yes', interests: 'Web', topic: ['Sales'] });
      assert.deepEqual(odd.json, { outcome: 'invalid', fields: { name: 'malformed', topic: 'malformed', copy: 'malformed', interests: 'malformed' } });
      assert.equal(kept().length, 1);
    });
  });

  describe('what is refused', () => {
    test('a form sent from a page that is not the site\'s own, by what the browser says, is refused and not kept', async () => {
      const elsewhere = [
        { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://elsewhere.example' },
        { 'Sec-Fetch-Site': 'same-site', Origin: 'https://shop.example.com' },
        { Origin: 'https://elsewhere.example' },
        { Referer: 'https://elsewhere.example/page/' },
        {},
        // As the web server passes on a header the browser did not send.
        { 'Sec-Fetch-Site': '', Origin: '', Referer: '' },
      ];
      const token = await tokenFor('note');
      later(5);
      for (const headers of elsewhere) {
        const answer = await sendJson('note', { note: 'Hello' }, { token, headers: { 'X-Konzilo-Client': '192.0.2.7', 'X-Konzilo-Host': HOST, ...headers } });
        assert.deepEqual([answer.status, answer.json], [403, { outcome: 'refused' }], JSON.stringify(headers));
      }
      assert.deepEqual(kept('note'), []);
    });

    test('a browser that says nothing of where it is takes the Origin, or else the Referer, on the host it reached or on a public host of the site\'s', async () => {
      const token = await tokenFor('note');
      later(5);
      for (const headers of [
        { Origin: SITE },
        { Origin: 'http://pre-launch.example:8080', 'X-Konzilo-Host': 'pre-launch.example:8080' },
        { Referer: `${SITE}/contact/` },
        { 'Sec-Fetch-Site': 'same-origin' },
      ]) {
        const answer = await sendJson('note', { note: 'Hello' }, { token, headers: { 'X-Konzilo-Client': '192.0.2.7', 'X-Konzilo-Host': 'localhost:4321', ...headers } });
        assert.equal(answer.json.outcome, 'sent', JSON.stringify(headers));
      }
    });

    test('a field the form does not declare, a form the site does not declare, and a body that is no form are refused, and nothing is kept', async () => {
      const token = await tokenFor('note');
      later(5);
      const unknown = await sendJson('note', { note: 'Hello', priority: 'high' }, { token });
      assert.deepEqual([unknown.status, unknown.json], [400, { outcome: 'refused' }]);

      const json = (body) => send(origin, 'POST', '/_konzilo/forms/note', { headers: { ...fromThePage(), 'Content-Type': 'application/json' }, body });
      for (const body of ['{"note":', '["Hello"]', 'null', '"Hello"']) {
        const answer = await json(body);
        assert.deepEqual([answer.status, answer.json], [400, { outcome: 'refused' }], body);
      }

      const undeclared = await sendJson('quote', { note: 'Hello' }, { token: null });
      assert.deepEqual([undeclared.status, undeclared.json], [404, { outcome: 'refused' }]);
      const encoded = await send(origin, 'POST', '/_konzilo/forms/quote', { headers: { ...fromThePage(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: '_page=%2Fquote%2F&note=Hello' });
      assert.equal(encoded.headers.location, '/quote/#konzilo-form-quote-refused');
      assert.equal((await send(origin, 'GET', '/_konzilo/forms/quote/token', { headers: fromThePage() })).status, 404);
      assert.deepEqual([...kept('note'), ...kept('quote')], []);
    });

    test('takes a form\'s own address alone: what lies below it, but its token, is not found', async () => {
      for (const path of ['/_konzilo/forms', '/_konzilo/forms/', '/_konzilo/forms/note/', '/_konzilo/forms/note/token/again', '/_konzilo/forms/note/other']) {
        const answer = await send(origin, 'POST', path, { headers: { ...fromThePage(), 'Content-Type': 'application/json' }, body: '{"note":"Hello"}' });
        assert.equal(answer.status, 404, path);
      }
      assert.equal((await send(origin, 'GET', '/_konzilo/forms/note', { headers: fromThePage() })).status, 404);
    });
  });

  describe('every request', () => {
    test('is refused for a method, a type or a size the kind does not take, or a path no kind takes, before the kind sees it, and none sets a cookie', async () => {
      const json = { ...fromThePage(), 'Content-Type': 'application/json' };
      const answers = {
        method: await send(origin, 'PUT', '/_konzilo/forms/note', { headers: json, body: '{}' }),
        type: await send(origin, 'POST', '/_konzilo/forms/note', { headers: { ...fromThePage(), 'Content-Type': 'text/plain' }, body: 'note=Hello' }),
        none: await send(origin, 'POST', '/_konzilo/forms/note', { headers: fromThePage(), body: 'note=Hello' }),
        size: await send(origin, 'POST', '/_konzilo/forms/note', { headers: json, body: JSON.stringify({ note: 'x'.repeat(600 * 1024) }) }),
        path: await send(origin, 'POST', '/_konzilo/elsewhere', { headers: json, body: '{}' }),
        prefix: await send(origin, 'GET', '/_konzilo/formsandmore/note/token', { headers: fromThePage() }),
      };
      assert.deepEqual(Object.fromEntries(Object.entries(answers).map(([why, { status }]) => [why, status])), { method: 405, type: 415, none: 415, size: 413, path: 404, prefix: 404 });
      assert.equal(answers.method.headers.allow, 'GET, POST');
      for (const [why, answer] of Object.entries(answers)) {
        assert.equal(answer.headers['cache-control'], 'no-store', why);
        assert.equal(answer.headers['x-content-type-options'], 'nosniff', why);
        assert.equal(answer.headers['set-cookie'], undefined, why);
      }
      assert.deepEqual(kept('note'), []);
    });

    test('refuses a body longer than a form takes by its length, unread', async () => {
      const answer = await new Promise((resolve, reject) => {
        const asked = request(new URL('/_konzilo/forms/note', origin), { method: 'POST', agent: false, headers: { ...fromThePage(), 'Content-Type': 'application/json', 'Content-Length': String(64 * 1024 * 1024) } }, resolve);
        asked.on('error', reject);
        // Only the start of what it says it holds.
        asked.write('{"note":"');
      });
      assert.equal(answer.statusCode, 413);
      answer.resume();
    });
  });

  describe('what is kept', () => {
    test('stays across a restart, under the same key, and holds nothing of the visitor\'s address, browser or the page it came from', async () => {
      const token = await tokenFor('note', { ...fromThePage('203.0.113.99'), Referer: `${SITE}/the-referring-page/`, 'User-Agent': 'A visitor\'s browser' });
      later(5);
      await sendJson('note', { note: 'Kept' }, { token, page: '/the-page-it-came-from/', headers: { ...fromThePage('203.0.113.99'), Referer: `${SITE}/the-referring-page/` } });
      const { key } = store;
      await stop();
      await start();

      assert.ok(store.key.equals(key), 'the same key');
      assert.equal((await sendJson('note', { note: 'With the token given before' }, { token })).json.outcome, 'sent');
      assert.deepEqual(kept('note').map(({ fields }) => fields[0].value), ['With the token given before', 'Kept']);
      await stop();
      const bytes = Buffer.concat(readdirSync(folder).map((name) => readFileSync(join(folder, name)))).toString('latin1');
      for (const words of ['203.0.113.99', 'the-referring-page', 'the-page-it-came-from', 'browser']) assert.ok(!bytes.includes(words), words);
      assert.ok(bytes.includes('Kept'));
      await start();
    });
  });

  describe('too many sends', () => {
    test('takes ten forms from one client in a window of ten minutes, spam among them, and refuses the next until the window ends, saying when', async () => {
      clock = new Date('2026-11-11T10:02:00Z');
      const token = await tokenFor('note');
      later(5);
      for (let sent = 0; sent < 10; sent += 1) {
        const answer = await sendJson('note', { note: `Number ${sent}`, _website: sent === 0 ? 'filled' : '' }, { token });
        assert.equal(answer.json.outcome, 'sent', String(sent));
        // A form the visitor gets wrong is no send.
        if (sent === 5) assert.equal((await sendJson('note', { note: '' }, { token })).json.outcome, 'invalid');
      }

      const refused = await sendJson('note', { note: 'One more' }, { token });
      assert.equal(refused.status, 429);
      assert.equal(refused.headers['retry-after'], '475');
      assert.deepEqual(refused.json, { outcome: 'too-many', retryAfter: 475 });
      const encoded = await send(origin, 'POST', '/_konzilo/forms/note', { headers: { ...fromThePage(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: '_page=%2Fcontact%2F&note=Hello' });
      assert.equal(encoded.headers.location, '/contact/#konzilo-form-note-too-many');
      assert.equal(kept('note').length, 10);

      // Another client sends as before, and this one again once its window has ended.
      assert.equal((await sendJson('note', { note: 'Someone else' }, { token, headers: fromThePage('198.51.100.4') })).json.outcome, 'sent');
      later(475);
      assert.equal((await sendJson('note', { note: 'Later' }, { token })).json.outcome, 'sent');
    });
  });

  describe('spam', () => {
    test('a form sent with the trap field filled in is answered as sent, and held as spam', async () => {
      const answer = await sendJson('note', { note: 'Buy now', _website: 'https://spam.example' });

      assert.deepEqual([answer.status, answer.json], [200, { outcome: 'sent' }]);
      assert.deepEqual(kept('note').map(({ spam }) => spam), ['trap']);
    });

    test('a form sent too soon after its token was given is answered as sent, and held as spam', async () => {
      const token = await tokenFor('note');
      later(1);
      const answer = await sendJson('note', { note: 'Fast fingers' }, { token });

      assert.deepEqual([answer.status, answer.json], [200, { outcome: 'sent' }]);
      later(3);
      await sendJson('note', { note: 'A person' }, { token });
      assert.deepEqual(kept('note').map(({ spam, fields }) => [spam, fields[0].value]), [[null, 'A person'], ['too-soon', 'Fast fingers']]);
    });

    test('a form sent by the page\'s script with no token, one made up, one of another form, or one from long ago, is refused and not kept', async () => {
      const token = await tokenFor('note');
      later(5);
      const [issued, nonce, mac] = token.split('.');
      const forged = [
        null,
        '',
        'not a token',
        `${issued}.${nonce}.${'A'.repeat(mac.length)}`,
        `${Number(issued) - 1}.${nonce}.${mac}`,
        await tokenFor('contact'),
      ];
      for (const given of forged) {
        const answer = await sendJson('note', { note: 'Hello' }, { token: given });
        assert.deepEqual([answer.status, answer.json], [403, { outcome: 'refused' }], String(given));
      }
      later(24 * 60 * 60);
      assert.equal((await sendJson('note', { note: 'Hello' }, { token })).json.outcome, 'refused', 'a day old');
      assert.deepEqual(kept('note'), []);
    });

    test('a form posted without JavaScript is held as spam with its trap field filled in, and its token checked where it gives one', async () => {
      const post = (fields) => send(origin, 'POST', '/_konzilo/forms/note', {
        headers: { ...fromThePage(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams([['_page', '/contact/'], ['note', 'Hello'], ...fields]).toString(),
      });
      assert.equal((await post([['_website', 'filled']])).headers.location, '/contact/#konzilo-form-note-sent');
      assert.equal((await post([['_website', ''], ['_token', 'made up']])).headers.location, '/contact/#konzilo-form-note-refused');
      assert.deepEqual(kept('note').map(({ spam }) => spam), ['trap']);
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
