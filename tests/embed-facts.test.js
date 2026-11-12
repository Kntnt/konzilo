// The core's facts of the embed services (src/format/services.json), each
// from its provider's own documents, and what an embed's placeholder says
// of each service before the visitor consents, which follows those facts as
// the cookie declaration does (ADR 0049, ADR 0052).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOGUES } from '../src/catalogues.js';
import { consentView } from '../src/consent/markup.js';
import { registryFile } from '../src/format/consent.js';
import facts from '../src/format/services.json' with { type: 'json' };

// The registry of a site whose posts show every embed service the core
// knows.
function registry() {
  const site = { language: 'en_GB', consent: { departures: [] } };
  const { file } = registryFile({ site, settings: { consent: {} }, embeds: Object.keys(facts), now: new Date('2026-11-12T12:00:00Z') });
  return JSON.parse(file.contents);
}

// Each embed service's placeholder sentence in a language, by its id.
function sentences(language) {
  const texts = { placeholder: { question: 'Play {service}?', button: 'Play {service}' } };
  const view = consentView({ registry: registry(), texts, language, catalogues: CATALOGUES });
  return Object.fromEntries(view.placeholders.map(({ service, storage }) => [service, storage]));
}

test('every embed service the core knows has a placeholder that says it may store data in the browser exactly where its facts list what it stores, in both catalogues', () => {
  const services = new Map(registry().services.map((service) => [service.id, service]));
  const english = sentences('en-GB');
  const swedish = sentences('sv-SE');
  assert.deepEqual(Object.keys(english).sort(), Object.keys(facts).sort());
  for (const [id, fact] of Object.entries(facts)) {
    const { name } = services.get(id);
    if (fact.storage.length > 0) {
      assert.ok(english[id].startsWith(`${name} may store data in your browser`), `${id}: ${english[id]}`);
      assert.ok(swedish[id].startsWith(`${name} kan lagra uppgifter i din webbläsare`), `${id}: ${swedish[id]}`);
    } else {
      assert.doesNotMatch(english[id], /stor/, id);
      assert.doesNotMatch(swedish[id], /lagr/, id);
      assert.match(english[id], new RegExp(`^${fact.provider.name.replace(/[.()]/g, '\\$&')} \\(.+\\) receives data about your visit`), id);
      assert.match(swedish[id], new RegExp(`^${fact.provider.name.replace(/[.()]/g, '\\$&')} \\(.+\\) tar emot uppgifter om ditt besök`), id);
    }
  }
});

test('YouTube, whose provider lists nothing its privacy-enhanced player stores, has a placeholder that says only who receives data about the visit, in both catalogues', () => {
  assert.equal(sentences('en-GB').youtube, 'Google Ireland Limited (Ireland) receives data about your visit, which may be processed outside the EU and EEA.');
  assert.equal(sentences('sv-SE').youtube, 'Google Ireland Limited (Irland) tar emot uppgifter om ditt besök, som kan behandlas utanför EU och EES.');
  assert.equal(sentences('en-GB').vimeo, 'Vimeo may store data in your browser, and Vimeo.com, Inc. (United States) receives data about your visit, which may be processed outside the EU and EEA.');
});

test('each fact of an embed service names its source, an address of its provider\'s documents and the day it was read, and the source of what a service stores says in a note what those documents say where they list nothing', () => {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  for (const [id, fact] of Object.entries(facts)) {
    assert.deepEqual(Object.keys(fact.sources).sort(), ['advertising', 'provider', 'purpose', 'storage', 'transfers'], id);
    for (const [name, source] of Object.entries(fact.sources)) {
      assert.match(source.url, /^https:\/\//, `${id}.${name}`);
      assert.match(source.checked, day, `${id}.${name}`);
      if (source.note !== undefined) assert.ok(typeof source.note === 'string' && source.note.trim().length > 0, `${id}.${name}`);
    }
    if (fact.storage.length === 0) assert.ok(typeof fact.sources.storage.note === 'string' && fact.sources.storage.note.length > 0, `${id}: what its provider's documents say of what it stores`);
  }
});
