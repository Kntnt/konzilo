// The consent's markup as pure functions: the banner with the preferences
// dialog and the placeholders' templates, the footer controls and the
// cookie declaration, each an HTML string made from what the caller hands
// in, with nothing read from a file, a collection or the site settings.
// Konzilo's components (src/astro/ConsentBanner.astro and the others) call
// them, the per-language consent script (script.js) does, and so can a site
// Konzilo does not build. docs/site-design.md is the contract of the
// classes and the attributes.
//
// Every function takes the same input, `{ registry, texts, legalPages,
// language, catalogues, host, locales }`:
//
// - `registry`: the service registry, as consent.json holds it
//   (content-format.md, "The service registry"): `revision`, `revised`,
//   `categories`, `services`, `departures` and `texts`.
// - `texts`: the consent texts the page shows, in the registry's shape,
//   `{ banner, dialog, footer, notice, placeholder, objection }`, with
//   `categories`, the name and description of a category by its id, where
//   the page's differ from the registry's; the registry's own `texts` by
//   default. Texts without `objection`, or without some of its texts, take
//   the consent texts' defaults for it from the catalogues (words.js). In
//   its `text` and `objected`, the words in square brackets are the link
//   (linked()).
// - `legalPages`: `{ privacyPolicy, cookiePolicy }`, each `{ title, href }`
//   or null, the address as the page links to it.
// - `language`: the page's language tag, such as en-GB; the core's own
//   words are in its language's catalogue, else British English's.
// - `catalogues`: the core's catalogues by language, `{ en, sv }`, as
//   src/catalogues/<language>.json holds them (ADR 0066), whose texts
//   `site.consent.…` are the core's own words (words.js).
// - `host`: the host of the page, such as www.example.com, which an item
//   stored on it is named by, or null where the markup serves pages on
//   more than one host; the client then names it from the page's address.
// - `locales`: the locale dates, times, numbers and countries are formatted
//   in, by the language of the core's words, `{ en, sv }`; en-GB and sv-SE
//   by default, and the language itself for another catalogue (words.js,
//   LOCALES). The client formats the visitor's choice in the same one.
//
// Every text is escaped, so a registry from anywhere is safe to render.
//
// This folder imports nothing outside itself; the catalogues come in with
// the input (words.js).

import { factWords, fill, formatLocale, wordsFor } from './words.js';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Text or an attribute's value, escaped for HTML.
export function escape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ENTITIES[character]);
}

// Whether a service is always on.
const isNecessary = (service) => service.category === 'necessary';

// The departure that has the statistics count before consent without
// storage, and so offers the visitor the right to object (ADR 0049).
const WITHOUT_STORAGE = 'statisticsWithoutStorageBeforeConsent';

// The texts of the right to object to counting without storage, from the
// page's texts and the core's defaults, where the registry offers it: a
// departure that counts without storage, and a statistics category to
// count in. Null where it offers none.
//
// { text, objected, title, appeal, confirm, cancel }: the explanation,
// which ends in the link that objects; the paragraph shown once the visitor
// objects, which holds the link that takes the objection back; the
// confirmation's title and appeal; and its two buttons.
function objectionOf(registry, texts, words) {
  const counts = (registry.departures ?? []).some((departure) => departure.departure === WITHOUT_STORAGE)
    && registry.categories.some((category) => category.id === 'statistics' && category.services.length > 0);
  return counts ? { ...words.objection, ...(texts?.objection ?? {}) } : null;
}

// Where a stored item is, `{ party, domain }`, as HTML: the page's own host
// for a first-party item with no domain, which the client fills in from
// the page's address (`data-konzilo-consent-host`), `host` or the words for
// this site until it runs; a domain shared with the sites below it for a
// first-party item with one; and the provider's domain, or the words for
// it where none is named, for a third-party item.
function domainMarkup({ party, domain }, words, host) {
  if (domain === null) return party === 'first' ? `<span data-konzilo-consent-host>${escape(host ?? words.thisHost)}</span>` : escape(words.unnamedDomain);
  return escape(party === 'first' ? fill(words.shared, { domain }) : domain);
}

const capital = (text) => `${text[0].toUpperCase()}${text.slice(1)}`;

// The privacy policy and the cookie policy, each once, since the cookie
// policy may be the privacy policy itself, each with `rel`, the link type
// that names it: privacy-policy or cookie-policy.
function policiesOf(legalPages = {}) {
  const pages = [legalPages.privacyPolicy, legalPages.cookiePolicy];
  return pages
    .map((page, index) => page && { ...page, rel: POLICY_RELS[index] })
    .filter((page, index) => page && pages.findIndex((other) => other?.href === page.href) === index);
}

// The link types a policy's link is marked with, `data-konzilo-consent-policy`,
// so that a page Konzilo does not build can give its own address for each
// (client.js, placeConsent()): `privacy-policy`, the link type registered
// for a privacy policy, and `cookie-policy`, which mirrors it.
const POLICY_RELS = ['privacy-policy', 'cookie-policy'];

// A link to a legal page, marked with the link type that names it.
const policyLink = (page, rel) => `<a href="${escape(page.href)}" data-konzilo-consent-policy="${rel}">${escape(page.title)}</a>`;

// The name and description a category shows: the page's, where `texts`
// gives them, else the registry's.
function categoryWords(category, texts) {
  const own = texts?.categories?.[category.id] ?? {};
  return { name: own.name ?? category.name, description: own.description ?? category.description };
}

// What the banner, the dialog, the footer controls and the placeholders
// show of the input, in its language: { asks, texts, policies,
// declaration, categories, placeholders, objection, labels, data }: whether
// the registry asks the visitor for consent (a category beyond necessary
// has a service), the texts, the privacy and cookie policies as { title,
// href, rel }, each once, the cookie policy alone, which holds the cookie
// declaration, or null, the categories with their services described, what
// the placeholder of each optional service that shows in a frame says, the
// texts of the right to object (objectionOf()), where the registry offers
// it, else null, the core's words, and
// what the client reads from the page, as JSON.
export function consentView({ registry, texts = registry.texts, legalPages = {}, language = 'en', catalogues, locales }) {
  const words = wordsFor(language, catalogues);
  const services = new Map(registry.services.map((service) => [service.id, service]));
  const plural = new Intl.PluralRules(formatLocale(language, catalogues, locales));
  const count = (number) => fill(words.serviceCount[plural.select(number) === 'one' ? 'one' : 'other'], { count: String(number) });
  const { country, kind, lifetime } = factWords(language, catalogues, locales);
  const describe = (service) => ({
    id: service.id,
    name: service.name,
    necessary: isNecessary(service),
    purpose: service.purpose,
    necessity: service.necessity,
    provider: service.provider && { name: service.provider.name, country: country(service.provider.country), privacyPolicy: service.provider.privacyPolicy },
    storage: service.storage.map((item) => ({ name: item.name, kind: kind(item.kind), lifetime: lifetime(item.lifetime), where: { party: item.party, domain: item.domain ?? null } })),
  });
  const optional = registry.services.filter((service) => !isNecessary(service));
  // What a placeholder says of its service follows its facts, as the
  // cookie declaration does: that it may store data in the browser only
  // where its facts list what it stores, and else no more than who receives
  // data about the visit, or, for a service of the site's own, that it is.
  const sentence = (service) => {
    const shape = !service.provider ? 'alone' : service.transfers.length > 0 ? 'transferred' : 'provided';
    const said = words.placeholder[service.storage.length > 0 ? shape : `${shape}WithoutStorage`];
    return fill(said, { service: service.name, provider: service.provider?.name, country: service.provider && country(service.provider.country) });
  };
  const objection = objectionOf(registry, texts, words);
  const data = {
    revision: registry.revision,
    categories: Object.fromEntries(registry.categories.map((category) => [category.id, category.services])),
    // What withdrawing consent removes: each optional service's storage
    // that the page itself can reach.
    storage: Object.fromEntries(optional
      .map((service) => [service.id, service.storage.filter((item) => item.party === 'first' && item.kind !== 'other').map(({ name, kind: itemKind }) => ({ name, kind: itemKind }))])
      .filter(([, items]) => items.length > 0)),
    // The language tag of the texts the page shows, which each record
    // notes.
    language,
    // Whether the registry offers the right to object.
    ...(objection ? { objection: true } : {}),
  };
  return {
    asks: optional.length > 0,
    texts,
    policies: policiesOf(legalPages),
    declaration: legalPages.cookiePolicy ?? null,
    categories: registry.categories.map((category) => ({
      id: category.id,
      ...categoryWords(category, texts),
      necessary: category.id === 'necessary',
      count: count(category.services.length),
      services: category.services.map((id) => describe(services.get(id))),
    })),
    // An embed's panel asks for consent to its service with these: the
    // question and the button from the texts, and between them a sentence
    // of the core's own from the service's facts. Every optional service
    // whose content shows in a frame has one, as each embed service has.
    placeholders: optional.filter((service) => (service.hosts?.frames ?? []).length > 0).map((service) => ({
      service: service.id,
      question: fill(texts.placeholder.question, { service: service.name }),
      storage: sentence(service),
      button: fill(texts.placeholder.button, { service: service.name }),
    })),
    objection,
    labels: words,
    data,
  };
}

// The buttons the client acts on, by their `data-konzilo-consent-action`:
// accept and reject alike, any other secondary, and the dialog's close.
const choice = (action, text) => `<button type="button" class="konzilo-consent-choice" data-konzilo-consent-action="${action}">${escape(text)}</button>`;
const secondary = (action, text, hidden = false) => `<button type="button" class="konzilo-consent-secondary" data-konzilo-consent-action="${action}"${hidden ? ' hidden' : ''}>${escape(text)}</button>`;
const policyList = (policies) => `<ul class="konzilo-consent-policies">${policies.map((page) => `<li>${policyLink(page, page.rel)}</li>`).join('')}</ul>`;

// Text with a link in it, as HTML: the first words of `text` in square
// brackets are the link, made by `link` from their escaped words, and the
// rest is escaped text without its brackets. A text that marks no link,
// such as one a site wrote without brackets, stays as it is, with the link
// after it in `fallback`'s words.
export function linked(text, fallback, link) {
  const marked = /\[([^\]\n]+)\]/.exec(text);
  if (!marked) return `${escape(text)} ${link(escape(fallback))}`;
  return `${escape(text.slice(0, marked.index))}${link(escape(marked[1]))}${escape(text.slice(marked.index + marked[0].length))}`;
}

// The right to object, wherever it stands: the explanation, whose link
// opens the confirmation, the dialog `#konzilo-consent-objection`, and,
// hidden until the visitor objects, the paragraph whose link takes the
// objection back. The client shows it while the visitor does not allow
// statistics, makes the explanation's link plain text once the visitor
// objects, and shows the second paragraph then. `hidden` until it does.
function objectionMarkup(objection, links) {
  const link = (action) => (words) => `<a href="#konzilo-consent-objection" class="konzilo-consent-objection-link" data-konzilo-consent-action="${action}">${words}</a>`;
  return [
    '<div class="konzilo-consent-objection" data-konzilo-consent-objection hidden>',
    `<p class="konzilo-consent-objection-text">${linked(objection.text, links.text, link('objection'))}</p>`,
    `<p class="konzilo-consent-objection-objected" data-konzilo-consent-objected hidden>${linked(objection.objected, links.objected, link('resume'))}</p>`,
    '</div>',
  ].join('');
}

// The consent's own part of a page, once on it: the banner, the notice
// shown in its place when the visitor withdraws consent, the preferences
// dialog, each hidden until the client shows it, and, where the registry
// offers the right to object, the dialog that asks the visitor to confirm
// an objection, and the template of each placeholder, in what the client
// finds them by,
// `[data-konzilo-consent]`, which holds the registry the client reads. A
// registry that asks no consent gives no banner, no notice and no dialog,
// and still the registry. `legalPage: true` marks the page as a legal page,
// the privacy policy or the cookie policy, where the client leaves the
// banner hidden, so that it covers nothing the visitor reads there before
// choosing.
export function consentMarkup(input, { legalPage = false } = {}) {
  const view = consentView(input);
  const { texts, labels } = view;
  const data = legalPage ? { ...view.data, legalPage: true } : view.data;
  const parts = [];
  if (view.asks) {
    parts.push([
      '<section class="konzilo-consent-banner" aria-labelledby="konzilo-consent-banner-title" hidden>',
      `<h2 class="konzilo-consent-title" id="konzilo-consent-banner-title">${escape(texts.banner.title)}</h2>`,
      `<p class="konzilo-consent-text">${escape(texts.banner.text)}</p>`,
      view.policies.length > 0 ? policyList(view.policies) : '',
      '<div class="konzilo-consent-buttons">',
      choice('accept', texts.banner.accept),
      choice('reject', texts.banner.reject),
      secondary('customise', texts.banner.customise),
      '</div>',
      '</section>',
    ].join(''));
    parts.push(`<div class="konzilo-consent-notice" role="status" hidden><p class="konzilo-consent-text">${escape(texts.notice.withdrawn)}</p></div>`);
    parts.push([
      '<dialog class="konzilo-consent-dialog" aria-labelledby="konzilo-consent-dialog-title">',
      '<div class="konzilo-consent-head">',
      `<h2 class="konzilo-consent-title" id="konzilo-consent-dialog-title">${escape(texts.dialog.title)}</h2>`,
      `<button type="button" class="konzilo-consent-close" data-konzilo-consent-action="close">${escape(texts.dialog.close)}</button>`,
      '</div>',
      `<p class="konzilo-consent-introduction">${escape(texts.dialog.introduction)}</p>`,
      ...view.categories.map((category) => categoryMarkup(category, labels, input.host ?? null, category.id === 'statistics' ? view.objection : null)),
      '<div class="konzilo-consent-buttons">',
      choice('accept', texts.dialog.accept),
      choice('reject', texts.dialog.reject),
      secondary('save', texts.dialog.save),
      '</div>',
      '</dialog>',
    ].join(''));
    // The confirmation of an objection: a plain appeal, and to confirm and
    // to cancel alike.
    if (view.objection) {
      parts.push([
        '<dialog class="konzilo-consent-confirmation" id="konzilo-consent-objection" aria-labelledby="konzilo-consent-objection-title" aria-describedby="konzilo-consent-objection-appeal">',
        `<h2 class="konzilo-consent-title" id="konzilo-consent-objection-title">${escape(view.objection.title)}</h2>`,
        `<p class="konzilo-consent-text" id="konzilo-consent-objection-appeal">${escape(view.objection.appeal)}</p>`,
        '<div class="konzilo-consent-buttons">',
        choice('object', view.objection.confirm),
        choice('cancel', view.objection.cancel),
        '</div>',
        '</dialog>',
      ].join(''));
    }
  }
  const cookiePolicy = view.declaration ? ` ${policyLink(view.declaration, 'cookie-policy')}` : '';
  for (const placeholder of view.placeholders) {
    parts.push([
      `<template data-konzilo-consent-placeholder="${escape(placeholder.service)}">`,
      `<p class="konzilo-embed-question">${escape(placeholder.question)}</p>`,
      `<p class="konzilo-embed-storage">${escape(placeholder.storage)}${cookiePolicy}</p>`,
      `<button type="button" class="konzilo-embed-allow">${escape(placeholder.button)}</button>`,
      '</template>',
    ].join(''));
  }
  return `<div class="konzilo-consent" data-konzilo-consent="${escape(JSON.stringify(data))}">${parts.join('')}</div>`;
}

// A category of the dialog: its row with its name, its count and its
// switch, its description, and its services, each with its facts and its
// own switch, or the words that it is always on; then, in the statistics
// category where the registry offers it, `objection`, the right to object
// (objectionMarkup()).
function categoryMarkup(category, labels, host, objection) {
  const id = `konzilo-consent-category-${category.id}`;
  const [before, after] = labels.on.split('{domain}');
  const services = category.services.map((service) => {
    const name = `konzilo-consent-service-${service.id}`;
    const toggle = service.necessary
      ? `<span class="konzilo-consent-always">${escape(labels.alwaysOn)}</span>`
      : `<input type="checkbox" role="switch" class="konzilo-consent-switch" aria-labelledby="${escape(name)}" data-konzilo-consent-service="${escape(service.id)}" data-konzilo-consent-in="${escape(category.id)}">`;
    const provider = service.provider
      ? `${escape(service.provider.name)}, ${escape(service.provider.country)}. <a href="${escape(service.provider.privacyPolicy)}">${escape(labels.privacyPolicy)}</a>`
      : escape(labels.site);
    const storage = service.storage.length > 0
      ? `<ul>${service.storage.map((item) => `<li><code>${escape(item.name)}</code>: ${escape(item.kind)}, ${escape(item.lifetime)}, ${escape(before)}${domainMarkup(item.where, labels, host)}${escape(after)}</li>`).join('')}</ul>`
      : escape(labels.nothing);
    return [
      '<li class="konzilo-consent-service">',
      `<div class="konzilo-consent-row"><h4 class="konzilo-consent-service-name" id="${escape(name)}">${escape(service.name)}</h4>${toggle}</div>`,
      '<dl class="konzilo-consent-facts">',
      `<dt>${escape(labels.purpose)}</dt><dd>${escape(service.purpose)}</dd>`,
      service.necessity ? `<dt>${escape(labels.necessity)}</dt><dd>${escape(service.necessity)}</dd>` : '',
      `<dt>${escape(labels.provider)}</dt><dd>${provider}</dd>`,
      `<dt>${escape(labels.stores)}</dt><dd>${storage}</dd>`,
      '</dl>',
      '</li>',
    ].join('');
  });
  return [
    `<section class="konzilo-consent-category" aria-labelledby="${escape(id)}">`,
    '<div class="konzilo-consent-row">',
    `<h3 class="konzilo-consent-category-name" id="${escape(id)}">${escape(category.name)}</h3>`,
    `<span class="konzilo-consent-count">${escape(category.count)}</span>`,
    `<input type="checkbox" role="switch" class="konzilo-consent-switch" aria-labelledby="${escape(id)}" data-konzilo-consent-category="${escape(category.id)}"${category.necessary ? ' checked disabled' : ''}>`,
    '</div>',
    `<p class="konzilo-consent-description">${escape(category.description)}</p>`,
    `<details class="konzilo-consent-services"><summary>${escape(labels.details)}</summary><ul>${services.join('')}</ul>`,
    objection ? objectionMarkup(objection, labels.objectionLinks) : '',
    '</details>',
    '</section>',
  ].join('');
}

// The footer controls: links to the privacy policy and the cookie policy,
// and Change privacy settings and Withdraw consent, as buttons, since
// neither navigates, hidden until the client shows them, and only where
// the registry asks for consent. `links: false` leaves the links out, for a
// footer that links the legal pages itself, and `buttons: false` the
// buttons, so that each can stand in a place of its own. `objection: true`
// adds the right to object to counting without storage, as the dialog has
// it, hidden until the client shows it, where the registry offers it, for
// a page such as the privacy policy to place. An empty string where
// nothing is left.
export function consentControlsMarkup(input, { links = true, buttons = true, objection = false } = {}) {
  const view = consentView(input);
  const policies = links ? view.policies : [];
  const withButtons = buttons && view.asks;
  const withObjection = objection && view.objection !== null;
  if (policies.length === 0 && !withButtons && !withObjection) return '';
  return [
    '<div class="konzilo-consent-controls">',
    policies.length > 0 ? policyList(policies) : '',
    withButtons ? `<div class="konzilo-consent-buttons">${secondary('change', view.texts.footer.change, true)}${secondary('withdraw', view.texts.footer.withdraw, true)}</div>` : '',
    withObjection ? objectionMarkup(view.objection, view.labels.objectionLinks) : '',
    '</div>',
  ].join('');
}

// What the cookie declaration shows of the input, in its language:
// { words, asks, locale, revised, categories, departures, footer, objection }:
// the declaration's own words; whether the registry asks for consent; the
// locale it formats in, which the client formats the visitor's choice in
// too; the day it last changed, { before, date, datetime, after }, the date
// in words and as HTML's <time> takes it, between the words around it; each
// category with its services and all their facts, in the registry's order;
// each departure in plain words with its reason; the footer's texts, which
// name the buttons; and the texts of the right to object where the registry
// offers it, else null. A service of the site's own links to the privacy
// policy.
export function declarationView({ registry, texts = registry.texts, legalPages = {}, language = 'en', catalogues, locales }) {
  const words = wordsFor(language, catalogues).declaration;
  const locale = formatLocale(language, catalogues, locales);
  const { country, kind, lifetime } = factWords(language, catalogues, locales);
  const services = new Map(registry.services.map((service) => [service.id, service]));
  const either = new Intl.ListFormat(locale, { type: 'disjunction' });
  const privacy = legalPages.privacyPolicy ?? null;
  const transfer = ({ country: code, safeguards }) => {
    const where = code === null ? words.unnamed : country(code);
    if (safeguards.length === 0) return fill(words.unguarded, { country: where });
    return fill(words.transfer, { country: where, safeguards: either.format(safeguards.map((safeguard) => words.safeguards[safeguard])) });
  };
  const describe = (service) => ({
    id: service.id,
    name: service.name,
    provider: service.provider
      ? { name: service.provider.name, country: country(service.provider.country), privacyPolicy: { title: fill(words.privacyPolicy, { provider: service.provider.name }), href: service.provider.privacyPolicy } }
      : { name: words.site, country: null, privacyPolicy: privacy && { ...privacy, rel: 'privacy-policy' } },
    purpose: service.purpose,
    necessity: service.necessity,
    hosts: [...new Set(Object.values(service.hosts).flat())].sort(),
    transfers: service.transfers.map(transfer),
    caption: fill(words.stores, { service: service.name }),
    storage: service.storage.map((item) => ({ name: item.name, kind: kind(item.kind), lifetime: lifetime(item.lifetime), party: words.party[item.party], where: { party: item.party, domain: item.domain ?? null } })),
  });
  const revised = new Date(registry.revised instanceof Date ? registry.revised : `${registry.revised}T00:00:00Z`);
  const [before, after] = words.revised.split('{date}');
  return {
    words,
    asks: registry.categories.some((category) => category.id !== 'necessary'),
    locale,
    revised: { before, date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(revised), datetime: revised.toISOString().slice(0, 10), after },
    categories: registry.categories.map((category) => ({
      id: category.id,
      ...categoryWords(category, texts),
      necessary: category.id === 'necessary',
      services: category.services.map((id) => describe(services.get(id))),
    })),
    departures: registry.departures.map((departure) => ({
      text: [fill(words.departure[departure.departure], { service: services.get(departure.service)?.name ?? departure.service }), words.privacySignals[departure.privacySignals]].filter(Boolean).join(' '),
      reason: departure.reason,
    })),
    footer: texts.footer,
    objection: objectionOf(registry, texts, wordsFor(language, catalogues)),
  };
}

// The cookie declaration, for the page that is the cookie policy, after
// its body: the visitor's own consent first, which the client fills in
// (client.js, cookieDeclaration()), in the declaration's locale, with
// Change privacy settings and Withdraw consent beside it, and the right to
// object to counting without storage where the registry offers it; then
// each category of the registry with its services and all their facts,
// after the day it last changed; and each departure with its reason.
//
// `level` is the level of its top headings, 2 by default, below the page's
// title; each category's heading is one level below, each service's two.
// `records` is the address the client sends the record of each choice to,
// or null where it sends none: the visitor's consent ID then stays out,
// since nobody could look it up.
export function cookieDeclarationMarkup(input, { level = 2, records = null } = {}) {
  const view = declarationView(input);
  const { words } = view;
  // A table's cell begins with a capital.
  const domainWords = wordsFor(input.language ?? 'en', input.catalogues);
  const cellWords = { ...domainWords, thisHost: capital(domainWords.thisHost), unnamedDomain: capital(domainWords.unnamedDomain) };
  const domain = (where) => domainMarkup(where, cellWords, input.host ?? null);
  const [top, category, service] = [0, 1, 2].map((below) => `h${Math.min(level + below, 6)}`);
  const heading = (tag, id, text) => `<${tag} id="${escape(id)}">${escape(text)}</${tag}>`;
  const own = view.asks
    ? [
        `<p class="konzilo-declaration-no-script">${escape(words.noScript)}</p>`,
        `<p class="konzilo-declaration-none" hidden>${escape(words.none)}</p>`,
        '<dl class="konzilo-declaration-choice" hidden>',
        records ? `<dt>${escape(words.id)}</dt><dd><code data-konzilo-declaration-id></code></dd>` : '',
        `<dt>${escape(words.given)}</dt><dd><time data-konzilo-declaration-time></time></dd>`,
        `<dt>${escape(words.allows)}</dt><dd><ul>`,
        ...view.categories.map((one) => `<li data-konzilo-declaration-category="${escape(one.id)}"${one.necessary ? '' : ' hidden'}>${escape(one.name)}</li>`),
        ...view.categories.filter((one) => !one.necessary).flatMap((one) => one.services.map((item) => `<li data-konzilo-declaration-service="${escape(item.id)}" data-konzilo-declaration-in="${escape(one.id)}" hidden>${escape(item.name)}</li>`)),
        '</ul></dd>',
        '</dl>',
        `<div class="konzilo-consent-buttons">${secondary('change', view.footer.change, true)}${secondary('withdraw', view.footer.withdraw, true)}</div>`,
        view.objection ? objectionMarkup(view.objection, domainWords.objectionLinks) : '',
      ].join('')
    : `<p>${escape(words.asksNone)}</p>`;
  const services = view.categories.map((one) => [
    `<section class="konzilo-declaration-category" aria-labelledby="konzilo-declaration-category-${escape(one.id)}">`,
    heading(category, `konzilo-declaration-category-${one.id}`, one.name),
    `<p>${escape(one.description)}</p>`,
    ...one.services.map((item) => serviceMarkup(item, { tag: service, words, domain })),
    '</section>',
  ].join(''));
  return [
    `<div class="konzilo-declaration" data-konzilo-declaration data-konzilo-declaration-locale="${escape(view.locale)}">`,
    '<section class="konzilo-declaration-consent" aria-labelledby="konzilo-declaration-consent">',
    heading(top, 'konzilo-declaration-consent', words.consent),
    own,
    '</section>',
    '<section class="konzilo-declaration-services" aria-labelledby="konzilo-declaration-services">',
    heading(top, 'konzilo-declaration-services', words.services),
    `<p class="konzilo-declaration-revised">${escape(view.revised.before)}<time datetime="${escape(view.revised.datetime)}">${escape(view.revised.date)}</time>${escape(view.revised.after)}</p>`,
    ...services,
    '</section>',
    view.departures.length > 0
      ? [
          '<section class="konzilo-declaration-departures" aria-labelledby="konzilo-declaration-departures">',
          heading(top, 'konzilo-declaration-departures', words.departures),
          `<ul>${view.departures.map((departure) => `<li>${escape(departure.text)} ${escape(words.reason)} ${escape(departure.reason)}</li>`).join('')}</ul>`,
          '</section>',
        ].join('')
      : '',
    '</div>',
  ].join('');
}

// A service of the declaration: its name, its provider, purpose, why it is
// necessary where it is, the hosts it reaches and its transfers, and a
// table of what it stores, each item with the domain it is on.
function serviceMarkup(service, { tag, words, domain }) {
  const id = `konzilo-declaration-service-${service.id}`;
  const provider = service.provider.country ? `${service.provider.name}, ${service.provider.country}.` : `${service.provider.name}.`;
  const page = service.provider.privacyPolicy;
  const policy = page ? ` ${page.rel ? policyLink(page, page.rel) : `<a href="${escape(page.href)}">${escape(page.title)}</a>`}` : '';
  const list = (items, none, code = false) => (items.length > 0 ? `<ul>${items.map((item) => `<li>${code ? `<code>${escape(item)}</code>` : escape(item)}</li>`).join('')}</ul>` : escape(none));
  const storage = service.storage.length > 0
    ? [
        '<table>',
        `<caption>${escape(service.caption)}</caption>`,
        `<thead><tr>${words.columns.map((column) => `<th scope="col">${escape(column)}</th>`).join('')}</tr></thead>`,
        `<tbody>${service.storage.map((item) => `<tr><td><code>${escape(item.name)}</code></td><td>${escape(item.kind)}</td><td>${escape(item.lifetime)}</td><td>${escape(item.party)}</td><td>${domain(item.where)}</td></tr>`).join('')}</tbody>`,
        '</table>',
      ].join('')
    : `<p>${escape(words.nothing)}</p>`;
  return [
    `<section class="konzilo-declaration-service" id="${escape(id)}" aria-labelledby="${escape(id)}-name">`,
    `<${tag} id="${escape(id)}-name">${escape(service.name)}</${tag}>`,
    '<dl>',
    `<dt>${escape(words.provider)}</dt><dd>${escape(provider)}${policy}</dd>`,
    `<dt>${escape(words.purpose)}</dt><dd>${escape(service.purpose)}</dd>`,
    service.necessity ? `<dt>${escape(words.necessity)}</dt><dd>${escape(service.necessity)}</dd>` : '',
    `<dt>${escape(words.hosts)}</dt><dd>${list(service.hosts, words.noHosts, true)}</dd>`,
    `<dt>${escape(words.transfers)}</dt><dd>${list(service.transfers, words.noTransfers)}</dd>`,
    '</dl>',
    storage,
    '</section>',
  ].join('');
}
