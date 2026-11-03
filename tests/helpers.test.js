// The helpers a site's templates call (`@kntnt/konzilo/astro/helpers`).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countOf, legalPages, longDate, oneLine, ordered, postalAddress, summary, termPath } from '@kntnt/konzilo/astro/helpers';

test('longDate writes a date as the same long date in each language', () => {
  const dates = ['2001-02-03T04:05:06Z'];
  assert.equal(longDate(new Date(dates[0]), 'en-GB'), '3 February 2001', 'a known long date');
  assert.equal(longDate(new Date(dates[0]), 'sv-SE'), '3 februari 2001');
});

test('termPath writes a term after its parents', async () => {
  const terms = {
    food: { id: 'food', data: { name: 'Food' } },
    fruit: { id: 'fruit', data: { name: 'Fruit', parent: { id: 'food' } } },
    apples: { id: 'apples', data: { name: 'Apples & pears', parent: { id: 'fruit' } } },
    loop: { id: 'loop', data: { name: 'Loop', parent: { id: 'loop' } } },
  };
  const getEntry = async ({ id }) => terms[id];
  const shown = await Promise.all(Object.values(terms).map((term) => termPath(term, { getEntry })));
  assert.deepEqual(shown, ['Food', 'Food › Fruit', 'Food › Fruit › Apples & pears', 'Loop']);
});

test('postalAddress writes a publisher\'s address on one line from what is filled', () => {
  const publishers = [
    { street: 'Storgatan 1', postalCode: '111 22', locality: 'Stockholm', country: 'Sverige' },
    { street: 'Storgatan 1', locality: 'Stockholm' },
    { postalCode: '111 22', country: 'Sverige' },
    { street: '  ', postalCode: '', locality: ' Lund ', country: undefined },
    {},
  ];
  const shown = publishers.map((publisher) => postalAddress(publisher));
  assert.deepEqual(shown, ['Storgatan 1, 111 22 Stockholm, Sverige', 'Storgatan 1, Stockholm', '111 22, Sverige', 'Lund', '']);
});

test('oneLine writes a text of lines on one line', () => {
  const texts = ['Finansinspektionen\nBox 7821\n\n103 97 Stockholm', '  One  ', '', 'a\r\nb\rc'];
  const shown = texts.map((text) => oneLine(text));
  assert.deepEqual(shown, ['Finansinspektionen, Box 7821, 103 97 Stockholm', 'One', '', 'a, b, c']);
});

test('legalPages lists the chosen legal pages in order, each address once', () => {
  const privacy = { title: 'Privacy', url: '/pages/privacy/' };
  const cookies = { title: 'Cookies', url: '/pages/cookies/' };
  const access = { title: 'Accessibility', url: '/pages/accessibility/' };
  const chosen = [
    { privacyPolicy: privacy, cookiePolicy: cookies, accessibilityStatement: access },
    { privacyPolicy: privacy, cookiePolicy: privacy, accessibilityStatement: access },
    { cookiePolicy: cookies },
    {},
  ];
  const shown = chosen.map((pages) => legalPages({ legalPages: pages }));
  assert.deepEqual(shown[1], [privacy, access]);
  assert.deepEqual(shown[3], []);
});

test('summary writes a text\'s first words, and an ellipsis where it has more', () => {
  const texts = [['The lantern keeps the harbour and the ships that come in at night', 5], ['Short text', 5], ['  Spaced\n\tout   words  here ', 2], ['', 3], ['Ett två tre fyra', 3], ['Exactly three words', 3]];
  const shown = texts.map(([text, words]) => summary(text, words));
  assert.deepEqual(shown, ['The lantern keeps the harbour…', 'Short text', 'Spaced out…', '', 'Ett två tre…', 'Exactly three words']);
  assert.equal(summary(Array.from({ length: 40 }, (_, index) => `w${index}`).join(' ')), `${Array.from({ length: 30 }, (_, index) => `w${index}`).join(' ')}…`, 'thirty words by default');
});

test('countOf counts a list\'s items', () => {
  const lists = [[], ['a'], [{ name: 'Food' }, { name: 'Fruit' }, { name: 'Apples' }]];
  const shown = lists.map((list) => countOf(list));
  assert.deepEqual(shown, [0, 1, 3]);
  assert.equal(countOf(null), 0);
});

test('ordered orders a list by a text of each item in the page\'s language, ties as they came', () => {
  const terms = [{ name: 'Äpplen' }, { name: 'apelsiner' }, { name: 'Bananer' }, { name: 'Zucchini' }, { name: 'bananer' }, { name: 'Örter' }];
  assert.deepEqual(ordered(terms, 'name', { language: 'sv-SE' }).map((term) => term.name), ['apelsiner', 'bananer', 'Bananer', 'Zucchini', 'Äpplen', 'Örter'], 'Swedish puts å, ä and ö last, and lowercase first');
  assert.deepEqual(ordered(terms, 'name', { language: 'en-GB' }).map((term) => term.name).slice(0, 2), ['apelsiner', 'Äpplen'], 'English among the a\'s');
  assert.throws(() => ordered(terms, 'name'), /language/);
});
