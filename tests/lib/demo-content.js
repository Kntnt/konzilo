// A site repository's own demo content, fictional and small, in the site template's model: what
// a site that shows itself with posts of its own keeps in its demo-content/, published content
// files as the core's demo content is, written by the intake's own writer. Nothing in it is the
// core's, so a page that shows it shows that the core's demo content was not used.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paragraphs, post, term, writeSite } from './content.js';
import { plainImage, sharp, shortHash } from './images.js';

const template = fileURLToPath(new URL('../../site-template/files/site-description.json', import.meta.url));

export const OWN_DEMO = Object.freeze({
  title: 'The Northern Lamplighters',
  article: { title: 'Lamps along the northern quay', address: '/lamps-along-the-northern-quay/', words: 'Every lamp on the quay is lit by hand at dusk.' },
  page: { title: 'About the lamplighters', address: '/pages/about-the-lamplighters/', words: 'The guild has kept the lamps since the harbour was dug.' },
});

// Writes it into `folder`, a site repository's demo-content/, with the article's image in media/.
export async function writeOwnDemoContent(folder) {
  const image = await plainImage(sharp, { width: 800, height: 600, format: 'webp' });
  const master = `lamps-along-the-northern-quay-${shortHash(image)}.webp`;
  mkdirSync(join(folder, 'media'), { recursive: true });
  writeFileSync(join(folder, 'media', master), image);
  const { article, page } = OWN_DEMO;
  writeSite(folder, JSON.parse(readFileSync(template, 'utf8')), [
    post({
      ID: 1,
      type: 'article',
      slug: 'lamps-along-the-northern-quay',
      title: article.title,
      headline: article.title,
      image: { src: `../media/${master}`, alt: 'A row of lit lamps along a quay' },
      body: paragraphs(article.words, 'The keepers walk the quay from the lighthouse to the fish market.'),
      terms: {
        authors: [term('mira-lund', 'Mira Lund', { taxonomy: 'authors' })],
        category: [term('quays', 'Quays', { taxonomy: 'category' })],
        topics: [term('lamps', 'Lamps', { taxonomy: 'topics' })],
      },
    }),
    post({ ID: 2, type: 'page', slug: 'about-the-lamplighters', title: page.title, body: paragraphs(page.words) }),
  ], { identity: { title: OWN_DEMO.title } });
  // What a build keeps of which post each file is, which demo content has no use for.
  rmSync(join(folder, '.post-ids.json'), { force: true });
}
