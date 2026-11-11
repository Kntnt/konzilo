// The image library as the editor reads and adds to it, against a stand-in for Forgejo, and what
// the chooser turns away before anything is sent. Compose has the real one.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { uploadProblem } from '../src/cms/body/chooser-check.js';
import { wordsIn } from '../src/refusals.js';
import { imageLibrary, mediaNameOf, stemOf } from '../src/cms/body/library.js';

const encoded = (text) => Buffer.from(text).toString('base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');

function forgejo({ files = {}, truncatedAt = null, failing = {} } = {}) {
  const asked = [];
  const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, blob: async () => new Blob(['picture']) });
  const get = async (url, { method = 'GET', headers = {}, body } = {}) => {
    const { pathname, searchParams } = new URL(url, 'http://admin');
    asked.push({ method, pathname, query: Object.fromEntries(searchParams), authorization: headers.authorization, body: body && JSON.parse(body) });
    if (failing[pathname]) return answer({}, failing[pathname].shift?.() ?? failing[pathname]);
    if (pathname.endsWith('/git/trees/main')) {
      const all = Object.entries(files).map(([path, { sha }]) => ({ path, sha, type: 'blob' }));
      if (truncatedAt === null) return answer({ tree: [...all, { path: 'image-library', type: 'tree', sha: 'folder' }], truncated: false });
      const page = Number(searchParams.get('page'));
      return answer({ tree: page === 1 ? all.slice(0, truncatedAt) : all.slice(truncatedAt), truncated: page === 1 });
    }
    if (pathname.endsWith('/git/blobs')) {
      const blobs = searchParams.get('shas').split(',').map((sha) => {
        const found = Object.values(files).find((one) => one.sha === sha);
        return { sha, content: encoded(found.text), encoding: 'base64' };
      });
      return answer(blobs);
    }
    if (pathname.endsWith('/contents')) return answer({}, 201);
    if (pathname === '/_konzilo/thumbnail') return answer({}, searchParams.get('of') === 'gone.webp' ? 404 : 200);
    throw new Error(`nothing to say of ${pathname}`);
  };
  return { asked, get };
}

const libraryOf = (stand, credential = () => 'token mine') => imageLibrary({ api: 'http://git/api/v1', repository: 'org/source', credential, get: stand.get, id: () => 'aaaaaaaaaaaa' });

const entry = (values) => ({ text: JSON.stringify(values) });

describe('the image library', () => {
  test('lists the entries that can be used, by their alt text, with the credential of whoever is signed in', async () => {
    const stand = forgejo({
      files: {
        'image-library/b.json': { sha: 'b1', ...entry({ src: '/media/b.webp', alt: 'Zebras', caption: 'In a row' }) },
        'image-library/a.json': { sha: 'a1', ...entry({ src: '/media/a.webp', alt: 'Ants' }) },
        'image-library/broken.json': { sha: 'c1', text: 'not json' },
        'image-library/empty.json': { sha: 'd1', ...entry({ alt: 'No file' }) },
        'image-library/notes.txt': { sha: 'e1', text: 'not an entry' },
        'articles/x.md': { sha: 'f1', text: 'not an entry' },
      },
    });
    assert.deepEqual(await libraryOf(stand).list(), [
      { src: '/media/a.webp', alt: 'Ants', caption: '' },
      { src: '/media/b.webp', alt: 'Zebras', caption: 'In a row' },
    ]);
    assert.ok(stand.asked.every(({ authorization }) => authorization === 'token mine'));
    const asked = stand.asked.find(({ pathname }) => pathname.endsWith('/git/blobs')).query.shas.split(',').sort();
    assert.deepEqual(asked, ['a1', 'b1', 'c1', 'd1'], 'nothing but entries is read');
  });

  test('reads a long tree page by page, and asks for each file once while a page is open', async () => {
    const files = Object.fromEntries(Array.from({ length: 65 }, (_, at) => [`image-library/${at}.json`, { sha: `sha${at}`, ...entry({ src: `/media/${at}.webp`, alt: `Image ${at}` }) }]));
    const stand = forgejo({ files, truncatedAt: 40 });
    const library = libraryOf(stand);
    assert.equal((await library.list()).length, 65);
    const asks = stand.asked.filter(({ pathname }) => pathname.endsWith('/git/blobs'));
    assert.ok(asks.length >= 3 && asks.every(({ query }) => query.shas.split(',').length <= 30), 'in parts the server answers in whole');
    stand.asked.length = 0;
    assert.equal((await library.list()).length, 65);
    assert.equal(stand.asked.filter(({ pathname }) => pathname.endsWith('/git/blobs')).length, 0);
  });

  test('asks nothing of anyone with nobody signed in', async () => {
    const stand = forgejo();
    await assert.rejects(libraryOf(stand, () => null).list(), /nobody is signed in/);
    assert.deepEqual(stand.asked, []);
  });

  test('says when Forgejo will not answer', async () => {
    const stand = forgejo({ failing: { '/api/v1/repos/org/source/git/trees/main': 500 } });
    await assert.rejects(libraryOf(stand).list(), /Forgejo answered 500/);
  });

  describe('adding', () => {
    const file = (name = 'En Båt på Sjön.PNG', bytes = PNG) => new File([bytes], name, { type: 'image/png' });
    const commitOf = ({ asked }) => asked.find(({ method, pathname }) => method === 'POST' && pathname.endsWith('/contents'));
    const bytesOf = (content) => Buffer.from(content, 'base64');

    test('commits the original and its entry as one, and gives the entry', async () => {
      const stand = forgejo();
      const added = await libraryOf(stand).add({ file: file(), alt: ' A boat ', caption: ' On the lake ' });
      assert.match(added.src, /^\/media\/en-bat-pa-sjon-[0-9a-f]{10}\.png$/);
      assert.deepEqual(added, { src: added.src, alt: 'A boat', caption: 'On the lake' });
      const { body } = commitOf(stand);
      assert.equal(body.branch, 'main');
      assert.match(body.message, /image library/);
      const [original, written] = body.files;
      assert.deepEqual([original.operation, original.path], ['create', added.src.slice(1)]);
      assert.deepEqual(bytesOf(original.content), PNG);
      assert.deepEqual([written.operation, written.path], ['create', 'image-library/aaaaaaaaaaaa.json']);
      assert.equal(bytesOf(written.content).toString(), `${JSON.stringify({ src: added.src, alt: 'A boat', caption: 'On the lake' }, null, 2)}\n`);
    });

    test('names the file by what it is, not what it is called, and leaves out a caption not given', async () => {
      const stand = forgejo();
      const added = await libraryOf(stand).add({ file: file('photo.jpg'), alt: 'A boat' });
      assert.match(added.src, /^\/media\/photo-[0-9a-f]{10}\.png$/);
      assert.deepEqual(added, { src: added.src, alt: 'A boat', caption: '' });
      assert.equal(bytesOf(commitOf(stand).body.files[1].content).toString(), `${JSON.stringify({ src: added.src, alt: 'A boat' }, null, 2)}\n`);
    });

    test('brings the same file once, and gives it another entry', async () => {
      const first = forgejo();
      const { src } = await libraryOf(first).add({ file: file(), alt: 'One' });
      const again = forgejo({ files: { [src.slice(1)]: { sha: 'x', text: '' } } });
      assert.equal((await libraryOf(again).add({ file: file(), alt: 'Other words' })).src, src);
      assert.deepEqual(commitOf(again).body.files.map(({ path }) => path), ['image-library/aaaaaaaaaaaa.json']);
    });

    test('tries once more when someone else has just brought it', async () => {
      const contents = '/api/v1/repos/org/source/contents';
      const stand = forgejo({ failing: { [contents]: [422, 201] } });
      await libraryOf(stand).add({ file: file(), alt: 'One' });
      assert.equal(stand.asked.filter(({ pathname }) => pathname === contents).length, 2);
    });

    test('says when it could not, and takes no other answer for one', async () => {
      const stand = forgejo({ failing: { '/api/v1/repos/org/source/contents': 500 } });
      await assert.rejects(libraryOf(stand).add({ file: file(), alt: 'One' }), /Forgejo answered 500/);
    });

    test('takes nothing that is no image, whatever it is called', async () => {
      await assert.rejects(libraryOf(forgejo()).add({ file: file('a.png', Buffer.from('words')), alt: 'One' }), /no image/);
    });
  });

  describe('its small pictures', () => {
    test('come from the service, with the credential, once for each while a page is open', async () => {
      const stand = forgejo();
      const library = libraryOf(stand);
      const [one, other] = await Promise.all([library.picture('/media/en bild.webp'), library.picture('/media/en%20bild.webp')]);
      assert.match(one, /^blob:/);
      assert.equal(one, other);
      assert.deepEqual(stand.asked.map(({ pathname, query, authorization }) => [pathname, query.of, authorization]), [['/_konzilo/thumbnail', 'en bild.webp', 'token mine']]);
    });

    test('are none where there is none, and are asked for again', async () => {
      const stand = forgejo();
      const library = libraryOf(stand);
      assert.equal(await library.picture('/media/gone.webp'), null);
      assert.equal(await library.picture('/media/gone.webp'), null);
      assert.equal(stand.asked.length, 2);
    });

    test('are none of what lies outside the media folder, which nobody is asked about', async () => {
      const stand = forgejo();
      assert.equal(await libraryOf(stand).picture('https://elsewhere.example/a.webp'), null);
      assert.deepEqual(stand.asked, []);
    });

    test('take a name as a content file gives it too', () => {
      assert.equal(mediaNameOf('../media/a.webp'), 'a.webp');
      assert.equal(mediaNameOf('../../media/a.webp'), 'a.webp');
      assert.equal(mediaNameOf('/media/a%20b.webp'), 'a b.webp');
      assert.equal(mediaNameOf('/elsewhere/a.webp'), null);
      assert.equal(mediaNameOf('/media/%E0%A4%A'), null);
    });
  });

  test('makes a file\'s name into words an address can hold', () => {
    assert.equal(stemOf('En Båt på Sjön (2).JPG'), 'en-bat-pa-sjon-2');
    assert.equal(stemOf('...'), 'image');
    assert.equal(stemOf('日本語.png'), 'image');
    assert.ok(stemOf(`${'a'.repeat(100)}.png`).length <= 60);
  });
});

describe('what the chooser turns away, before anything is sent', () => {
  const size = (width, height) => async () => ({ width, height });
  const named = (bytes) => new File([bytes], 'whatever.png');
  const header = (...text) => Buffer.from(text.join(''), 'latin1');
  // In British English, and in the interface language the chooser shows it in.
  const problem = async (file, site, measure, language = 'en') => {
    const found = await uploadProblem(file, site, measure);
    return found === null ? null : wordsIn(language, found);
  };

  test('a file too large for the site', async () => {
    const huge = { size: 30 * 1024 * 1024 + 1, slice: () => named(PNG) };
    assert.match(await problem(huge, {}, size(2000, 1000)), /30 MB/);
  });

  test('what the site cannot use, by what it is', async () => {
    assert.match(await problem(named(header('GIF89a')), {}), /a GIF/);
    assert.match(await problem(named(header('\0\0\0\x18ftypheic')), {}), /a HEIC/);
    assert.match(await problem(named(header('II*\0')), {}), /a TIFF/);
    assert.match(await problem(named(header('BM')), {}), /a BMP/);
    assert.match(await problem(named(header('words')), {}), /this file/);
    assert.match(await problem(named(header('version https://git-lfs.github.com/spec/v1\n')), {}), /this file/);
    assert.match(await problem(named(PNG), {}, async () => {
      throw new Error('cannot be read');
    }), /this file/);
  });

  test('says so in the interface language', async () => {
    assert.equal(await problem(named(header('GIF89a')), {}, undefined, 'sv'), 'webbplatsen kan inte använda en GIF som bild; spara den som JPEG, PNG eller WebP, och ladda upp den');
    assert.match(await problem(named(PNG), { smallestWidth: 400 }, size(399, 300), 'sv'), /^den här bilden är 399 pixlar bred/);
  });

  test('a WebP that moves', async () => {
    const moving = Buffer.alloc(32);
    moving.write('RIFF', 0, 'latin1');
    moving.write('WEBP', 8, 'latin1');
    moving.write('VP8X', 12, 'latin1');
    moving[20] = 0x02;
    assert.match(await problem(named(moving), {}, size(2000, 1000)), /moving image/);
    moving[20] = 0;
    assert.equal(await problem(named(moving), {}, size(2000, 1000)), null);
  });

  test('what is narrower than the site takes, measured as its master', async () => {
    assert.match(await problem(named(PNG), { smallestWidth: 400 }, size(399, 300)), /399 pixels wide/);
    assert.equal(await problem(named(PNG), { smallestWidth: 400 }, size(400, 300)), null);
    // Its longest side comes down to 2520, and its width with it.
    assert.match(await problem(named(PNG), { smallestWidth: 400 }, size(500, 5040)), /250 pixels wide/);
    assert.equal(await problem(named(PNG), {}, size(1, 1)), null);
  });

  test('and an SVG goes on to the check that can read it', async () => {
    assert.equal(await uploadProblem(named(header('<svg xmlns="http://www.w3.org/2000/svg"/>')), { smallestWidth: 400 }), null);
  });
});
