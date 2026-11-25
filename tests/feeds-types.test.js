// The types an Admin may choose for an incoming feed (ADR 0079): those whose posts can be published
// from what a feed gives, a title, a text of paragraphs, a date and a link, and an article's main
// headline, which is its title. A type that requires more, such as a featured image, or that takes
// no paragraph, cannot be chosen.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { feedTypes } from '../src/feeds/types.js';
import { siteDescription } from '../src/site-description.js';

test('a type can be chosen for a feed where a feed gives all it requires', () => {
  const site = siteDescription({
    language: 'en_GB',
    images: { smallestWidth: 400, displayWidth: 1280 },
    taxonomies: { region: { label: 'Region', plural: 'Regions', collection: 'regions' } },
    types: {
      article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'heading'] },
      page: { collection: 'pages', address: '/pages/{slug}/', elements: ['paragraph'] },
      release: { label: 'Release', plural: 'Releases', collection: 'releases', address: '/releases/{slug}/', elements: ['paragraph'], fields: { date: {}, excerpt: {}, image: {}, featured: { label: 'Featured', type: 'boolean', control: 'toggle' }, regions: { taxonomy: 'region' } } },
      pictured: { label: 'Pictured', plural: 'Pictured', collection: 'pictured', address: '/pictured/{slug}/', elements: ['paragraph'], fields: { image: { required: true } } },
      regional: { label: 'Regional', plural: 'Regional', collection: 'regional', address: '/regional/{slug}/', elements: ['paragraph'], fields: { regions: { taxonomy: 'region', required: true } } },
      priced: { label: 'Priced', plural: 'Priced', collection: 'priced', address: '/priced/{slug}/', elements: ['paragraph'], fields: { price: { label: 'Price', type: 'number', control: 'number', required: true } } },
      gallery: { label: 'Gallery', plural: 'Galleries', collection: 'galleries', address: '/galleries/{slug}/', elements: ['image', 'gallery'] },
    },
  });
  assert.deepEqual(Object.fromEntries(feedTypes(site).map(({ name, choosable }) => [name, choosable])), {
    article: true,
    page: true,
    release: true,
    pictured: false,
    regional: false,
    priced: false,
    gallery: false,
  });
});
