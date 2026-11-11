// The intake suite's own hands: source files as a test writes them, images that need no
// sharp, and one run of the function. A function without input or output runs hundreds of
// cases in a second, and these keep it so.

import { intake } from '../../src/intake/index.js';

// The moment of a build, unless a test says otherwise.
export const NOW = new Date('2026-11-03T12:00:00Z');

// What a master's name says of its original, from a name that holds its hash, or a hash
// made of the path: the seam the command fills with sharp and SVGO.
export function namedImages({ width = 1600, height = 1000 } = {}) {
  return (path) => {
    const hash = /-([0-9a-f]{10})\.[a-z]+$/.exec(path)?.[1] ?? Buffer.from(path).toString('hex').padEnd(10, '0').slice(-10);
    const svg = path.endsWith('.svg');
    // A site icon is square, or the site refuses it.
    const side = path.includes('site-icon') ? { width, height: width } : { width, height };
    return { hash: `${hash}${'0'.repeat(54)}`, extension: svg ? 'svg' : 'webp', svg, ...side, contents: `the master of ${path}` };
  };
}

const scalar = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value : JSON.stringify(value));

// A post's source file: its fields and its body.
export function sourcePost(fields, body = '') {
  const lines = Object.entries(fields).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}: ${scalar(value)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}${body === '' ? '' : '\n'}`;
}

// The source files of a run, from a path and its contents by path.
export const asFiles = (files) => Object.entries(files).map(([path, contents]) => ({ path, contents: typeof contents === 'object' && !Buffer.isBuffer(contents) ? `${JSON.stringify(contents, null, 2)}\n` : contents }));

// One run: `files` by path, the rest as intake() takes it.
export function run(files, site, options = {}) {
  return intake({ files: asFiles(files), site, now: NOW, images: namedImages(), ...options });
}

// The files of a result, by path.
export const written = (result) => Object.fromEntries(result.files.map(({ path, contents }) => [path, contents]));

// A site with one type that takes every element the rule data knows.
export const everyElement = Object.freeze({
  language: 'en_GB',
  images: { smallestWidth: 1, displayWidth: 1 },
  types: {
    page: {
      label: 'Page',
      plural: 'Pages',
      collection: 'pages',
      address: '/{slug}/',
      elements: ['paragraph', 'heading', 'list', 'quote', 'code', 'table', 'footnotes', 'embed', 'image', 'gallery', 'post-list', 'form'],
    },
  },
  presentations: {
    list: {
      label: 'List',
      options: {
        date: { label: 'Date', type: 'boolean', control: 'toggle' },
      },
    },
  },
  forms: { contact: { label: 'Contact us', fields: [{ name: 'email', label: 'Email', kind: 'email', required: true }] } },
});

// A page of that site, and its body as the intake writes it, its date and last change the
// moment of the build that first took it.
export const pageSource = (body) => sourcePost({ title: 'Hello world', slug: 'hello-world', status: 'published' }, body);
export const pagePath = 'pages/1a2b3c4d5e6f.md';
export const pageFile = (body) => `---\ntitle: "Hello world"\ndate: 2026-11-03T12:00:00Z\nmodified: 2026-11-03T12:00:00Z\n---\n${body === '' ? '' : `\n${body}\n`}`;
