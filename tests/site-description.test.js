// The checker names every problem in a site description by its path, whatever
// the description holds: a value of the wrong kind is a problem to report, and
// never a crash that hides the others.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { siteDescription } from '../src/site-description.js';

for (const language of ['Swedish', 'sv-SE', '', 42, null, ['sv_SE']]) {
  test(`names a language of ${JSON.stringify(language)} as a problem, among the others`, () => {
    assert.throws(() => siteDescription({ language }), (error) => {
      assert.notEqual(error.name, 'ReferenceError', error.message);
      assert.match(error.message, new RegExp(`language: ${JSON.stringify(JSON.stringify(language)).slice(1, -1).replace(/[[\]]/g, '\\$&')} is not a locale`));
      assert.match(error.message, /types/);
      return true;
    });
  });
}

test('takes the domain the consent choice is kept on, in lowercase, never a public suffix or a shared domain, nor a name above one', () => {
  const types = { page: { label: 'Page', plural: 'Pages', collection: 'pages', address: '/{slug}/', elements: ['paragraph'] } };
  const read = (domain) => siteDescription({ language: 'en_GB', types, consent: { domain } }).consent;
  assert.deepEqual(read('example.com'), { departures: [], domain: 'example.com' });
  assert.equal(read('www.example.co.uk').domain, 'www.example.co.uk');
  assert.equal(siteDescription({ language: 'en_GB', types }).consent.domain, null);
  for (const [domain, problem] of [
    ['co.uk', /consent\.domain: co\.uk is a public suffix/],
    ['github.io', /consent\.domain: github\.io is a shared domain/],
    ['amazonaws.com', /consent\.domain: amazonaws\.com takes in s3\.amazonaws\.com, which is a shared domain/],
    ['Example.com', /consent\.domain: "Example\.com" must be a domain name in lowercase/],
    ['https://example.com', /consent\.domain: "https:\/\/example\.com" must be a domain name/],
    ['com', /consent\.domain: "com" must be a domain name/],
    [42, /consent\.domain: 42 must be a domain name/],
  ]) {
    assert.throws(() => read(domain), (error) => problem.test(error.message), JSON.stringify(domain));
  }
});

test('takes the departure that counts without storage before consent with what Global Privacy Control and Do Not Track do, and no other departure with it', () => {
  const types = { page: { label: 'Page', plural: 'Pages', collection: 'pages', address: '/{slug}/', elements: ['paragraph'] } };
  const read = (departures) => siteDescription({ language: 'en_GB', types, consent: { departures } }).consent.departures;
  const departure = (privacySignals) => ({ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'Counted from the first page.', ...(privacySignals === undefined ? {} : { privacySignals }) });
  assert.deepEqual(read([departure('stop')]), [{ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'Counted from the first page.', privacySignals: 'stop' }]);
  assert.equal(read([departure('ignore')])[0].privacySignals, 'ignore');
  for (const given of [undefined, 'yes', true]) {
    assert.throws(() => read([departure(given)]), /consent\.departures\.1\.privacySignals: must say whether Global Privacy Control or Do Not Track stops the counting altogether, "stop", or not, "ignore"/, JSON.stringify(given));
  }
  assert.throws(() => read([{ departure: 'tagManagerBeforeConsent', reason: 'Tags wait.', privacySignals: 'stop' }]), /consent\.departures\.1\.privacySignals: is no part of this departure/);
});

describe('the interface language', () => {
  const types = { page: { label: 'Page', plural: 'Pages', collection: 'pages', address: '/{slug}/', elements: ['paragraph'] } };

  test('is the one the site declares, else its language where the core has a catalogue for it, else British English', () => {
    assert.equal(siteDescription({ language: 'sv_SE', interfaceLanguage: 'en', types }).interfaceLanguage, 'en');
    assert.equal(siteDescription({ language: 'en_GB', interfaceLanguage: 'sv', types }).interfaceLanguage, 'sv');
    assert.equal(siteDescription({ language: 'sv_SE', types }).interfaceLanguage, 'sv');
    assert.equal(siteDescription({ language: 'sv_FI', types }).interfaceLanguage, 'sv');
    assert.equal(siteDescription({ language: 'en_US', types }).interfaceLanguage, 'en');
    assert.equal(siteDescription({ language: 'fi', types }).interfaceLanguage, 'en');
    assert.equal(siteDescription({ types }).interfaceLanguage, 'en');
    assert.equal(siteDescription({ languages: ['sv_SE', 'en_GB'], types }).interfaceLanguage, 'sv');
  });

  for (const given of ['de', 'sv_SE', 'Swedish', '', 3, null]) {
    test(`refuses ${JSON.stringify(given)}, in plain words`, () => {
      assert.throws(
        () => siteDescription({ language: 'sv_SE', interfaceLanguage: given, types }),
        (error) => error.message.includes(`interfaceLanguage: ${JSON.stringify(given)} is not a language Konzilo's interface comes in, which are en (British English) and sv (Swedish)`),
      );
    });
  }
});

describe('a site\'s own label', () => {
  const declared = (label) => ({
    language: 'sv_SE',
    types: {
      article: {
        label,
        plural: { en: 'Articles', sv: 'Artiklar' },
        collection: 'articles',
        address: '/{slug}/',
        elements: ['paragraph'],
        fields: { size: { label: { en: 'Size', sv: 'Storlek' }, type: 'string', control: 'text' }, tags: { taxonomy: 'tag' } },
      },
    },
    taxonomies: { tag: { label: { en: 'Tag', sv: 'Etikett' }, plural: 'Etiketter', collection: 'tags' } },
    presentations: { list: { label: { en: 'List', sv: 'Lista' }, options: { date: { label: { en: 'Date', sv: 'Datum' }, type: 'boolean', control: 'toggle' } } } },
    menus: { main: { label: { en: 'Main menu', sv: 'Huvudmeny' } } },
    settings: { footer: { label: { en: 'Footer', sv: 'Sidfot' }, type: 'string', control: 'text' } },
    components: { card: { label: { en: 'Card', sv: 'Kort' }, form: 'container', body: 'blocks', attributes: { tone: { type: 'string', label: { en: 'Tone', sv: 'Ton' } } } } },
  });

  test('is one text for every language, or a text by interface language, British English among them', () => {
    const read = siteDescription(declared('Artikel'));
    assert.equal(read.types.article.label, 'Artikel');
    assert.deepEqual(read.types.article.plural, { en: 'Articles', sv: 'Artiklar' });
    assert.deepEqual(read.types.article.fields.find((field) => field.name === 'size').label, { en: 'Size', sv: 'Storlek' });
    assert.deepEqual(read.taxonomies.tag.label, { en: 'Tag', sv: 'Etikett' });
    assert.deepEqual(read.presentations.list.label, { en: 'List', sv: 'Lista' });
    assert.deepEqual(read.presentations.list.options[0].label, { en: 'Date', sv: 'Datum' });
    assert.deepEqual(read.menus.main.label, { en: 'Main menu', sv: 'Huvudmeny' });
    assert.deepEqual(read.settings[0].label, { en: 'Footer', sv: 'Sidfot' });
    assert.deepEqual(read.components.card.label, { en: 'Card', sv: 'Kort' });
    assert.deepEqual(read.components.card.attributes.tone.label, { en: 'Tone', sv: 'Ton' });
    assert.deepEqual(siteDescription(declared({ en: 'Article' })).types.article.label, { en: 'Article' });
  });

  for (const [label, problem] of [
    [{ sv: 'Artikel' }, 'types.article.label: gives no en, the British English a label by language needs'],
    [{ en: 'Article', de: 'Artikel' }, 'types.article.label.de: de is not a language Konzilo\'s interface comes in, which are en (British English) and sv (Swedish)'],
    [{ en: 'Article', sv: ' ' }, 'types.article.label.sv: must be a non-empty string'],
    [{}, 'types.article.label: gives no en, the British English a label by language needs'],
    [42, 'types.article.label: must be a non-empty string, or one by interface language, such as { "en": "Article", "sv": "Artikel" }'],
    [['Article'], 'types.article.label: must be a non-empty string, or one by interface language, such as { "en": "Article", "sv": "Artikel" }'],
  ]) {
    test(`refuses ${JSON.stringify(label)}, naming what is wrong`, () => {
      assert.throws(() => siteDescription(declared(label)), (error) => error.message.includes(problem));
    });
  }

  test('of a component is refused as any other, by its path', () => {
    const given = declared('Artikel');
    given.components.card.label = { sv: 'Kort' };
    given.components.card.attributes.tone.label = { en: 'Tone', fi: 'Sävy' };
    assert.throws(() => siteDescription(given), (error) => error.message.includes('components.card.label: gives no en')
      && error.message.includes('components.card.attributes.tone.label.fi: fi is not a language Konzilo\'s interface comes in'));
  });
});
