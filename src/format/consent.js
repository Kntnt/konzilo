// The service registry: one content file, consent.json, written
// at every build beside settings.json, that lists every service a page of
// the site may let the visitor's browser reach, in the consent categories,
// with each service's facts, the site's departures from the consent rules,
// the consent texts in the site's language and the revision. The banner,
// the embeds, the tag manager, the cookie declaration and the security policy
// all read this one file.

import { createHash } from 'node:crypto';
import { inLanguage } from '../texts.js';

import { tagManagerIds, tagManagerServices } from './tag-manager.js';
import rules from './rules.json' with { type: 'json' };
import coreFacts from './services.json' with { type: 'json' };

// The path of the registry's file in the content folder.
export const CONSENT_FILE = 'consent.json';

// The settings group of Konzilo's own that holds the consent texts
// (settings-groups.json); the registry is written for a site it applies to,
// which is every site.
export const CONSENT_GROUP = 'consent';

// The consent categories, in the order a visitor meets them. Necessary is
// always on.
export const CATEGORIES = Object.freeze(['necessary', 'functional', 'statistics', 'marketing']);

// What a service stores in the visitor's browser is one of these kinds.
export const STORAGE_KINDS = Object.freeze(['cookie', 'localStorage', 'sessionStorage', 'other']);

// The kinds of request a service's hosts are reached by, each the source
// list of a directive of the security policy: script-src, frame-src,
// connect-src, img-src, style-src and font-src.
export const HOST_KINDS = Object.freeze(['scripts', 'frames', 'connections', 'images', 'styles', 'fonts']);

// What a transfer of personal data outside the EU and EEA rests on: an
// adequacy decision of the Commission (for the US, the provider's
// certification under the EU–US Data Privacy Framework), standard
// contractual clauses, or binding corporate rules.
export const SAFEGUARDS = Object.freeze(['adequacy', 'scc', 'bcr']);

// A lifetime: until the browser session ends, without an end, or an ISO
// 8601 duration of one unit, such as P12M or PT30M.
export const LIFETIME = /^(session|persistent|P[1-9][0-9]*[YMWD]|PT[1-9][0-9]*[HMS])$/;

// The consent's own storage item: the name the client keeps the visitor's
// choice under, in local storage, and the months a choice holds, a refusal
// too. The registry declares it, and the
// client (src/consent/client.js) keeps the choice there.
export const CONSENT_STORAGE = Object.freeze({ name: 'konzilo-consent', months: 12 });

// The consent's own storage: the visitor's choice and its ID.
function consentStorage() {
  return [{
    id: 'consent',
    name: { en: 'Consent', sv: 'Samtycke' },
    category: 'necessary',
    provider: null,
    purpose: {
      en: 'Remembers which categories and services you allowed, and when, so that the site respects your choice.',
      sv: 'Kommer ihåg vilka kategorier och tjänster du har tillåtit, och när, så att webbplatsen respekterar ditt val.',
    },
    storage: [{ name: CONSENT_STORAGE.name, kind: 'localStorage', lifetime: `P${CONSENT_STORAGE.months}M`, party: 'first' }],
    necessity: {
      en: 'Without it the site could not keep to your choice, and would ask you on every page.',
      sv: 'Utan den kunde webbplatsen inte hålla sig till ditt val, och skulle fråga dig på varje sida.',
    },
  }];
}

// Each embed service the site's pages show, with the core's facts of it
// (services.json) and the hosts its players load from, by the rule data.
// A provider that uses what it learns for its own advertising or profiling,
// or whose player stores what another uses so, makes its service marketing;
// any other is functional.
function embedServices({ embeds, facts }) {
  return [...embeds].map((id) => {
    const fact = facts[id];
    if (!fact) throw new Error(`the core has no facts of the embed service ${id}; add them to services.json`);
    return {
      id,
      name: rules.embeds.services[id].name,
      category: fact.advertising ? 'marketing' : 'functional',
      provider: fact.provider,
      purpose: fact.purpose,
      storage: fact.storage,
      hosts: { frames: playerHosts(rules.embeds.services[id]) },
      transfers: fact.transfers,
    };
  });
}

// The hosts a service's players load from: the host of each address form's
// player, in the rule data.
export function playerHosts(service) {
  return [...new Set(service.addresses.map((form) => new URL(form.player.replace(/\{[^}]+\}/g, 'x')).host))].sort();
}

// The ids of the core's own services, which no service an Admin declares
// may take: the consent's own storage, every embed service of the rule
// data and every tag manager's (tag-managers.json). A feature that adds a
// service adds its id here.
export function coreServiceIds() {
  return ['consent', ...Object.keys(rules.embeds.services), ...tagManagerIds()];
}

// The core features that add services to the registry, each a function of
// what the build knows to the services it adds: { site, settings, embeds,
// facts }, the site as checked, the values of settings.json, the ids of the
// embed services the site's pages show and the core's facts of them. A
// service is given as docs/agents/consent.md describes it; a text visitors
// read may be given in each language ({ en, sv }), and the registry takes
// the site's. A feature adds its function here, before the last, which
// gives the services an Admin declares (`declared`, from
// declared-services.js), as the tag manager (tag-manager.js) does.
const FEATURES = [consentStorage, embedServices, tagManagerServices, ({ declared }) => declared];

// The registry's file for a site.
//
// `site`: the site as checked. `settings`: the values settings.json holds,
// the consent texts among them, under CONSENT_GROUP. `embeds`: the ids of
// the embed services the site's pages show. `facts`: the core's facts of
// the embed services, as services.json holds them. `previous`: the registry
// as the last build wrote it, parsed, or null; it keeps the day the revision
// last changed. `now`: the moment of the build. `declared`: the services
// an Admin declares, as declaredServices() gives them.
//
// Returns { file, warnings, asksConsent }, each warning { consent, reason },
// `consent` the path in the site description of what it is about;
// `asksConsent` whether the registry holds a service beyond the necessary
// ones, which a visitor is asked to allow.
export function registryFile({ site, settings, embeds, facts = coreFacts, previous = null, now, declared = [] }) {
  const texts = settings[CONSENT_GROUP];
  const warnings = [];
  const services = FEATURES.flatMap((feature) => feature({ site, settings, embeds, facts, declared })).map((service) => serviceOf(service, site.language));
  const ids = new Set();
  for (const service of services) {
    if (ids.has(service.id)) throw new Error(`two services of the registry have the id ${service.id}`);
    ids.add(service.id);
  }
  site.consent.departures.forEach((departure, index) => {
    if (departure.departure !== 'necessaryService') return;
    const service = services.find((found) => found.id === departure.service);
    if (!service) {
      warnings.push({ consent: `consent.departures.${index + 1}`, reason: `the departure names the service ${departure.service}, which no page of the site lets a visitor reach` });
      return;
    }
    service.category = 'necessary';
    service.necessity = departure.reason;
  });
  services.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const categories = CATEGORIES
    .map((id) => ({
      id,
      name: texts[`${id}Name`],
      description: texts[`${id}Description`],
      services: services.filter((service) => service.category === id).map((service) => service.id),
    }))
    .filter((category) => category.services.length > 0);
  const departures = site.consent.departures.map((departure) => ({ ...departure }));
  const revision = revisionOf({ categories, services, departures });
  const kept = previous?.revision === revision && /^\d{4}-\d{2}-\d{2}$/.test(previous.revised ?? '');
  const revised = kept ? previous.revised : now.toISOString().slice(0, 10);
  const registry = { revision, revised, categories, services, departures, texts: textsOf(texts) };
  const asksConsent = categories.some((category) => category.id !== 'necessary');
  return { file: { path: CONSENT_FILE, contents: `${JSON.stringify(registry, null, 2)}\n` }, warnings, asksConsent };
}

// A service as the registry holds it: its facts in the site's language,
// with every kind of request's hosts, sorted.
function serviceOf(service, language) {
  return {
    id: service.id,
    name: inLanguage(service.name, language),
    category: service.category,
    provider: service.provider ? { ...service.provider } : null,
    purpose: inLanguage(service.purpose, language),
    storage: (service.storage ?? []).map((item) => ({ name: item.name, kind: item.kind, lifetime: item.lifetime, party: item.party, domain: domainOf(item, service) })),
    hosts: Object.fromEntries(HOST_KINDS.map((kind) => [kind, [...new Set(service.hosts?.[kind] ?? [])].sort()])),
    transfers: (service.transfers ?? []).map((transfer) => ({ country: transfer.country, safeguards: [...transfer.safeguards] })),
    necessity: service.category === 'necessary' ? inLanguage(service.necessity, language) : null,
  };
}

// The domain a stored item is on: the one its facts give, null for the
// host of the page that stores it, which is a first-party item's unless
// its facts name a domain shared with the sites below it, and for a
// third-party item the host its service shows in, else loads from, which
// is its provider's: the first of its frames, or of its scripts, requests,
// images, styles or fonts, `*.` left out; null where it reaches none.
function domainOf(item, service) {
  if (item.domain !== undefined) return item.domain;
  if (item.party === 'first') return null;
  const kinds = ['frames', ...HOST_KINDS.filter((kind) => kind !== 'frames')];
  const host = kinds.map((kind) => [...(service.hosts?.[kind] ?? [])].sort()[0]).find(Boolean);
  return host ? host.replace(/^\*\./, '') : null;
}

// The revision: a hash of what a visitor consents to, the categories with
// their services, each service's facts and the departures, and not of the
// wording, the consent texts and the categories' names and descriptions.
function revisionOf({ categories, services, departures }) {
  const consented = {
    categories: categories.map((category) => ({ id: category.id, services: category.services })),
    services,
    departures,
  };
  return createHash('sha256').update(JSON.stringify(consented)).digest('hex').slice(0, 16);
}

// The consent texts by where a visitor meets them, from the group's settings
// by name: `bannerTitle` is the banner's `title`. The registry holds the
// main language's; a page on a site in several languages takes its own
// language's from its settings.
const places = {
  banner: ['title', 'text', 'accept', 'reject', 'customise'],
  dialog: ['title', 'introduction', 'accept', 'reject', 'save', 'close'],
  footer: ['change', 'withdraw'],
  notice: ['withdrawn'],
  placeholder: ['question', 'button'],
};

export function textsOf(texts) {
  const capital = (name) => `${name[0].toUpperCase()}${name.slice(1)}`;
  return Object.fromEntries(Object.entries(places).map(([place, names]) => [
    place,
    Object.fromEntries(names.map((name) => [name, texts[`${place}${capital(name)}`]])),
  ]));
}
