// Small pictures of originals, with real sharp, against a stand-in for Forgejo: who gets one, what
// one is, and how seldom an original is fetched.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import sharp from 'sharp';

import { buildControl } from '../src/build/record.js';
import { editorsService } from '../src/service/editors.js';
import { thumbnails } from '../src/service/thumbnails.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';

describe('small pictures of originals', () => {
  let folder;
  let count = 0;
  let large;

  before(async () => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-thumbnails-'));
    large = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#336699' } }).withExif({ IFD0: { Copyright: 'Someone', ImageDescription: 'A secret place' } }).jpeg().toBuffer();
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  const running = async ({ originals = {}, down = false, moment = () => new Date() } = {}) => {
    const asked = [];
    const answerOf = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    const get = async (url, { headers }) => {
      const { pathname, search } = new URL(url);
      asked.push({ pathname, search, authorization: headers.authorization });
      if (down) throw new Error('nobody home');
      if (pathname === '/api/v1/repos/org/source') return answerOf({ permissions: { push: headers.authorization === 'token may-write' } });
      const contents = /\/contents\/media\/(.+)$/.exec(pathname);
      if (contents) {
        const name = decodeURIComponent(contents[1]);
        return Object.hasOwn(originals, name) ? answerOf({ type: 'file', sha: originals[name].sha }) : answerOf({}, 404);
      }
      const media = /\/media\/media\/(.+)$/.exec(pathname);
      if (media) {
        const { bytes } = originals[decodeURIComponent(media[1])];
        return { ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => Buffer.from(bytes) };
      }
      throw new Error(`nothing to say of ${pathname}`);
    };
    const kept = join(folder, `kept-${(count += 1)}`);
    const service = editorsService({
      forgejo: 'http://forgejo',
      repository: 'org/source',
      token: 'read-token',
      control: buildControl(join(folder, `control-${count}`)),
      pictures: thumbnails({ forgejo: 'http://forgejo', repository: 'org/source', token: 'read-token', folder: kept, get }),
      get,
      now: moment,
    });
    const server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    return {
      asked,
      kept,
      picture: (of, headers = { authorization: 'token may-write' }, method = 'GET') => fetch(`http://127.0.0.1:${server.address().port}/_konzilo/thumbnail?of=${encodeURIComponent(of)}`, { headers, method }),
      close: () => new Promise((go) => {
        server.closeAllConnections();
        server.close(go);
      }),
    };
  };

  const withService = (options, work) => async () => {
    const one = await running(typeof options === 'function' ? options() : options);
    try {
      await work(one);
    } finally {
      await one.close();
    }
  };

  const photo = () => ({ originals: { 'a photo.jpg': { sha: 'abc123', bytes: large } } });

  test('go to whoever may write, and to nobody else', withService(photo, async ({ picture, asked }) => {
    assert.equal((await picture('a photo.jpg', {})).status, 401);
    assert.equal((await picture('a photo.jpg', { authorization: 'nonsense' })).status, 401);
    assert.equal((await picture('a photo.jpg', { authorization: 'token may-read' })).status, 401);
    assert.equal(asked.filter(({ pathname }) => pathname.includes('/media/')).length, 0, 'and no original is fetched for them');
    assert.equal((await picture('a photo.jpg')).status, 200);
    assert.equal((await picture('a photo.jpg', undefined, 'POST')).status, 405);
  }));

  test('are small, upright WebP without anything of the original\'s metadata, and hold no script', withService(photo, async ({ picture }) => {
    const answer = await picture('a photo.jpg');
    assert.equal(answer.headers.get('content-type'), 'image/webp');
    assert.equal(answer.headers.get('x-content-type-options'), 'nosniff');
    assert.match(answer.headers.get('content-security-policy'), /default-src 'none'; sandbox/);
    const bytes = Buffer.from(await answer.arrayBuffer());
    assert.ok(bytes.length < large.length / 2);
    const { width, height, format, exif } = await sharp(bytes).metadata();
    assert.deepEqual({ width, height, format, exif }, { width: 640, height: 427, format: 'webp', exif: undefined });
  }));

  test('are fetched from Forgejo with the service\'s own credential, and an original once', withService(photo, async ({ picture, asked, kept }) => {
    assert.equal((await picture('a photo.jpg')).status, 200);
    assert.equal((await picture('a photo.jpg')).status, 200);
    const fetched = asked.filter(({ pathname }) => pathname.endsWith('/media/media/a%20photo.jpg'));
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].authorization, 'token read-token');
    assert.deepEqual(readdirSync(kept), ['abc123.webp'], 'kept by the version of the file, and nothing half-written');
  }));

  test('are asked about in a browser\'s cache by version, private to the one who asked', withService(photo, async ({ picture }) => {
    const first = await picture('a photo.jpg');
    await first.arrayBuffer();
    assert.equal(first.headers.get('etag'), '"abc123"');
    assert.match(first.headers.get('cache-control'), /^private,/);
    assert.equal(first.headers.get('vary'), 'authorization');
    const second = await picture('a photo.jpg', { authorization: 'token may-write', 'if-none-match': '"abc123"' });
    assert.equal(second.status, 304);
    assert.equal((await second.arrayBuffer()).byteLength, 0);
  }));

  test('ask Forgejo about a person once for a whole page of them, and again after a moment', async () => {
    let moment = 1_000_000;
    const one = await running({ ...photo(), moment: () => new Date(moment) });
    try {
      const askedAbout = () => one.asked.filter(({ pathname }) => pathname === '/api/v1/repos/org/source').length;
      await one.picture('a photo.jpg');
      await one.picture('a photo.jpg');
      assert.equal(askedAbout(), 1);
      moment += 30_001;
      await one.picture('a photo.jpg');
      assert.equal(askedAbout(), 2);
    } finally {
      await one.close();
    }
  });

  test('give an SVG as itself', withService({ originals: { 'a.svg': { sha: 'def456', bytes: Buffer.from(SVG) } } }, async ({ picture }) => {
    const answer = await picture('a.svg');
    assert.equal(answer.headers.get('content-type'), 'image/svg+xml');
    assert.match(answer.headers.get('content-security-policy'), /sandbox/);
    assert.equal(await answer.text(), SVG);
  }));

  test('say why there is none, and keep nothing of it', withService({ originals: { 'a.gif': { sha: 'aaa', bytes: Buffer.from('GIF89a') }, 'b.jpg': { sha: 'bbb', bytes: Buffer.from([0xff, 0xd8, 0xff, 0, 1, 2]) }, 'c.jpg': { sha: 'ccc', bytes: Buffer.alloc(30 * 1024 * 1024 + 1) } } }, async ({ picture, kept }) => {
    assert.equal((await picture('gone.jpg')).status, 404);
    assert.equal((await picture('a.gif')).status, 415);
    assert.equal((await picture('b.jpg')).status, 415, 'a file that only starts like an image');
    assert.equal((await picture('c.jpg')).status, 413);
    assert.equal(existsSync(kept), false);
  }));

  test('come from the media folder alone, however the name is written', withService(photo, async ({ picture, asked }) => {
    for (const name of ['../settings.json', '..', 'a/../../settings.json', '/etc/passwd', '']) assert.equal((await picture(name)).status, 400, name);
    assert.deepEqual(asked.filter(({ pathname }) => pathname !== '/api/v1/repos/org/source'), []);
  }));

  test('are none when nobody can make them', async () => {
    const service = editorsService({ forgejo: 'http://forgejo', repository: 'org/source', token: 't', control: buildControl(join(folder, 'control-none')), get: async () => ({ ok: true, json: async () => ({ permissions: { push: true } }) }) });
    const server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    const answer = await fetch(`http://127.0.0.1:${server.address().port}/_konzilo/thumbnail?of=a.jpg`, { headers: { authorization: 'token x' } });
    assert.equal(answer.status, 404);
    server.closeAllConnections();
    await new Promise((go) => server.close(go));
  });
});
