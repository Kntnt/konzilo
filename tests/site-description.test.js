// The checker names every problem in a site description by its path, whatever
// the description holds: a value of the wrong kind is a problem to report, and
// never a crash that hides the others.

import assert from 'node:assert/strict';
import { test } from 'node:test';

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

test('lets the pages show data: images unless security.dataImages is false, and refuses any other value', () => {
  const types = { page: { label: 'Page', plural: 'Pages', collection: 'pages', address: '/{slug}/', elements: ['paragraph'] } };
  const read = (security) => siteDescription({ language: 'en_GB', types, ...(security === undefined ? {} : { security }) }).security.dataImages;
  assert.equal(read(undefined), true);
  assert.equal(read({}), true);
  assert.equal(read({ dataImages: true }), true);
  assert.equal(read({ dataImages: false }), false);
  for (const given of ['false', 'no', 0, null, []]) {
    assert.throws(() => read({ dataImages: given }), /security\.dataImages: must be true or false/, JSON.stringify(given));
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
