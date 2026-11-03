// Konzilo's own consent client: what the integration's
// components, ConsentBanner.astro (the banner, the preferences dialog and
// the embeds' placeholders) and ConsentControls.astro (the footer
// controls), render from the service registry, and the script,
// consentClient(), that keeps the visitor's choice and gives the consent
// signal on every page.
//
// The components render everything a visitor reads into the page's HTML,
// in the site's language; the script only shows, hides and reads it. It is
// part of the integration's one script file of the site's own origin, and
// the page holds no inline code, so it works under a policy that allows no
// inline script.

import { CONSENT_GROUP, textsOf } from '../format/consent.js';
import rules from '../format/rules.json' with { type: 'json' };
import { RESERVED_PREFIX } from '../site-description.js';
import { textLanguage } from '../texts.js';

// The services whose content a page embeds, by the rule data: the ones a
// placeholder asks for.
const EMBED_SERVICES = new Set(Object.keys(rules.embeds.services));

// Where a page sends the record of each choice: the kind of request of the
// site's public endpoint for consent records.
export const CONSENT_RECORDS = `${RESERVED_PREFIX}consent`;

// The words of the dialog the core writes itself, in each of its languages.
const LABELS = {
  en: {
    service: ['service', 'services'],
    details: 'Services and what they store',
    alwaysOn: 'Always on',
    purpose: 'Purpose',
    necessity: 'Why it is needed',
    provider: 'Provider',
    site: 'This site',
    privacyPolicy: 'Privacy policy',
    stores: 'Stores in your browser',
    nothing: 'Its provider names nothing it stores',
    session: 'until you close the browser',
    persistent: 'with no end',
    kinds: { cookie: 'cookie', localStorage: 'local storage', sessionStorage: 'session storage', other: 'other storage' },
    // A placeholder's sentence on what its service may store and where its
    // data goes: with no provider, with one, and with one whose data may
    // leave the EU and EEA.
    placeholder: [
      '{service} may store data in your browser.',
      '{service} may store data in your browser, and {provider} ({country}) receives data about your visit.',
      '{service} may store data in your browser, and {provider} ({country}) receives data about your visit, which may be processed outside the EU and EEA.',
    ],
  },
  sv: {
    service: ['tjänst', 'tjänster'],
    details: 'Tjänster och vad de lagrar',
    alwaysOn: 'Alltid på',
    purpose: 'Syfte',
    necessity: 'Varför den behövs',
    provider: 'Leverantör',
    site: 'Den här webbplatsen',
    privacyPolicy: 'Integritetspolicy',
    stores: 'Lagrar i din webbläsare',
    nothing: 'Leverantören anger inget som den lagrar',
    session: 'tills du stänger webbläsaren',
    persistent: 'utan slut',
    kinds: { cookie: 'kaka', localStorage: 'lokal lagring', sessionStorage: 'sessionslagring', other: 'annan lagring' },
    placeholder: [
      '{service} kan lagra uppgifter i din webbläsare.',
      '{service} kan lagra uppgifter i din webbläsare, och {provider} ({country}) tar emot uppgifter om ditt besök.',
      '{service} kan lagra uppgifter i din webbläsare, och {provider} ({country}) tar emot uppgifter om ditt besök, som kan behandlas utanför EU och EES.',
    ],
  },
};

// A lifetime's unit, in ISO 8601 (an M after T is minutes), as Intl names it.
const UNITS = { Y: 'year', M: 'month', W: 'week', D: 'day', H: 'hour', TM: 'minute', S: 'second' };

// What the components show of the registry, in the site's language, the
// page's on a site in several.
//
// `registry`: the registry as Astro's collection `consent` hands it out.
// `settings`: the site settings, in the page's language, whose legal pages
// the banner and the footer controls link to and whose consent texts, with
// the categories' names and descriptions, the components show; the
// registry's, the main language's, where the settings have none. `site`:
// { locale, languageTag, base }, the page's locale and language tag, and
// the base its pages are below.
//
// Returns { asks, texts, policies, declaration, categories, placeholders,
// data, labels }: whether the registry asks the visitor for consent (a
// category beyond necessary has a service), its texts, the chosen privacy
// and cookie policies as { title, href }, each once, the cookie policy
// alone, which holds the cookie declaration, or null, the categories with
// their services described, what the placeholder of each embed service
// that waits for consent says, the labels of the dialog, and what the
// script reads from the page, as JSON.
export function consentView(registry, settings, { locale, languageTag, base = '/' }) {
  const labels = LABELS[textLanguage(locale)];
  const own = settings?.[CONSENT_GROUP];
  const texts = own ? textsOf(own) : registry.texts;
  const services = new Map(registry.services.map((service) => [service.id, service]));
  const plural = new Intl.PluralRules(languageTag);
  const count = (number) => `${number} ${labels.service[plural.select(number) === 'one' ? 0 : 1]}`;
  const { country, kind, lifetime } = factWords({ locale, languageTag });
  const describe = (service) => ({
    id: service.id,
    name: service.name,
    necessary: service.category === 'necessary',
    purpose: service.purpose,
    necessity: service.necessity,
    provider: service.provider && { name: service.provider.name, country: country(service.provider.country), privacyPolicy: service.provider.privacyPolicy },
    storage: service.storage.map((item) => ({ name: item.name, kind: kind(item.kind), lifetime: lifetime(item.lifetime) })),
  });
  const optional = registry.services.filter((service) => service.category !== 'necessary');
  const [alone, provided, transferred] = labels.placeholder;
  const sentence = (service) => {
    const words = !service.provider ? alone : service.transfers.length > 0 ? transferred : provided;
    return words.replaceAll('{service}', service.name)
      .replaceAll('{provider}', service.provider?.name)
      .replaceAll('{country}', service.provider && country(service.provider.country));
  };
  const data = {
    revision: registry.revision,
    categories: Object.fromEntries(registry.categories.map((category) => [category.id, category.services])),
    // What withdrawing consent removes: each optional service's storage
    // that the page itself can reach.
    storage: Object.fromEntries(optional
      .map((service) => [service.id, service.storage.filter((item) => item.party === 'first' && item.kind !== 'other').map(({ name, kind }) => ({ name, kind }))])
      .filter(([, items]) => items.length > 0)),
    // The language tag of the texts the page shows, which each record
    // notes.
    language: languageTag,
  };
  return {
    asks: optional.length > 0,
    texts,
    policies: policies(settings, base),
    declaration: settings?.legalPages?.cookiePolicy ? linkTo(settings.legalPages.cookiePolicy, base) : null,
    categories: registry.categories.map((category) => ({
      id: category.id,
      name: own?.[`${category.id}Name`] ?? category.name,
      description: own?.[`${category.id}Description`] ?? category.description,
      necessary: category.id === 'necessary',
      count: count(category.services.length),
      services: category.services.map((id) => describe(services.get(id))),
    })),
    // An embed's panel asks for consent to its service with these: the question and the button from the texts, and between them
    // a sentence of the core's own from the service's facts.
    placeholders: optional.filter((service) => EMBED_SERVICES.has(service.id)).map((service) => ({
      service: service.id,
      question: texts.placeholder.question.replaceAll('{service}', service.name),
      storage: sentence(service),
      button: texts.placeholder.button.replaceAll('{service}', service.name),
    })),
    labels,
    data: JSON.stringify(data),
  };
}

// The words the core writes itself of a service's facts, in the language of
// a site in `locale` and `languageTag` (its language tag):
// `country(code)`, a country's name by its ISO 3166-1 alpha-2 code;
// `kind(kind)`, a kind of storage; and `lifetime(value)`, how long an item
// is kept, from the registry's ISO 8601 duration, `session` or
// `persistent`.
export function factWords({ locale, languageTag }) {
  const labels = LABELS[textLanguage(locale)];
  const regions = new Intl.DisplayNames([languageTag], { type: 'region' });
  return {
    country: (code) => regions.of(code),
    kind: (kind) => labels.kinds[kind],
    lifetime: (value) => {
      if (value === 'session' || value === 'persistent') return labels[value];
      const [, time, number, unit] = /^P(T?)(\d+)([YMWDHS])$/.exec(value);
      return new Intl.NumberFormat(languageTag, { style: 'unit', unit: UNITS[unit === 'M' && time ? 'TM' : unit], unitDisplay: 'long' }).format(Number(number));
    },
  };
}

// The privacy policy and the cookie policy the site settings choose, each
// once, since the cookie policy may be the privacy policy itself.
function policies(settings, base) {
  const { privacyPolicy, cookiePolicy } = settings?.legalPages ?? {};
  const pages = [privacyPolicy, cookiePolicy].filter((page, index, all) => page && all.findIndex((other) => other?.url === page.url) === index);
  return pages.map((page) => linkTo(page, base));
}

// A legal page of the site settings as a link, below the site's base.
export function linkTo(page, base) {
  return { title: page.title, href: `${base.replace(/\/$/, '')}${page.url}` };
}

// The script of the consent client, which the integration puts into every
// page's script file. It runs in the visitor's browser, so it uses nothing
// from this module: `name` is the consent's own storage item, in local
// storage, `months` how long a choice holds, and `records` the address the
// record of each choice is sent to (CONSENT_RECORDS), or null for a page no
// visitor sees, such as a preview.
//
// It reads the registry the banner component writes into the page (its
// revision, its categories with their services, the storage withdrawing
// removes and the language of the page's texts), shows the banner while no
// choice holds, opens the dialog, keeps each choice, and gives the consent
// signal, window.konziloConsent, and its event, `konzilo:consent` on the
// document. A page without the banner component allows nothing beyond the
// necessary. A choice older than `months` is removed as the page loads, so
// the next choice has a new consent ID.
//
// It sends the record of each choice to the site's endpoint in the
// background, and never waits for it: the consent ID, the choice's time,
// the revision, every state, how the choice was made (the part, `how`, and
// its control), the page's path and the language of the texts it showed.
// Until the endpoint has stored it, each record waits beside the choice, in
// the list `unsent`, and a later page view sends each once more and then
// gives it up; the choice holds regardless.
export function consentClient({ name, months, records = null }) {
  // The page has its signal already, from an earlier run of the script.
  if ('konziloConsent' in window) return;
  const root = document.querySelector('[data-konzilo-consent]');
  let registry = { revision: null, categories: {}, storage: {} };
  try {
    if (root) registry = JSON.parse(root.dataset.konziloConsent);
  } catch {
    // A page with a broken registry allows nothing beyond the necessary.
  }
  const categoryOf = new Map(Object.entries(registry.categories).flatMap(([category, services]) => services.map((service) => [service, category])));
  const banner = root?.querySelector('.konzilo-consent-banner') ?? null;
  const dialog = root?.querySelector('dialog') ?? null;

  // The choice kept in the browser, whether it holds or not, or null.
  const kept = () => {
    try {
      const choice = JSON.parse(localStorage.getItem(name));
      return choice && typeof choice.id === 'string' && typeof choice.time === 'string' ? choice : null;
    } catch {
      return null;
    }
  };

  // Whether a kept choice is older than `months`, the consent's own
  // storage's lifetime.
  const expired = (choice) => {
    const until = new Date(choice.time);
    until.setUTCMonth(until.getUTCMonth() + months);
    return !(Date.now() < until.getTime());
  };
  // A kept choice holds for the registry's revision, `months` from when it
  // was made.
  const holds = (choice) => Boolean(choice) && choice.revision === registry.revision
    && typeof choice.services === 'object' && choice.services !== null && !expired(choice);

  // The choice alone, without the records that wait beside it.
  const own = ({ unsent, ...rest }) => rest;
  const keep = (value) => {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // Storage refused: the choice holds on this page alone.
    }
  };

  // A choice older than its lifetime is gone, its consent ID with it: the
  // next choice has a new one.
  if (kept() && expired(kept())) {
    try {
      localStorage.removeItem(name);
    } catch {
      // Storage refused: nothing was kept.
    }
  }

  let choice = holds(kept()) ? own(kept()) : null;
  // A copy of the choice, for code of the page's that may change what it
  // is handed.
  const copy = (value) => JSON.parse(JSON.stringify(value));

  // The records that wait beside the kept choice, each as it is sent.
  const unsent = (value) => (Array.isArray(value?.unsent) ? value.unsent : []);
  // The record of a choice, sent to the endpoint without waiting for it.
  // Once the endpoint has stored it, it no longer waits beside the choice;
  // every other record that waits still does. A page without the registry
  // has nothing a record could name.
  const sending = typeof records === 'string' && typeof fetch === 'function' && typeof registry.revision === 'string' && typeof registry.language === 'string';
  const send = (record) => {
    const stored = () => {
      const now = kept();
      if (!now) return;
      const left = unsent(now).filter((other) => other.id !== record.id || other.chosen !== record.chosen);
      keep(left.length > 0 ? { ...own(now), unsent: left } : own(now));
    };
    // The answer's body is read, so that the request ends: a browser keeps
    // one whose body nobody reads open.
    try {
      fetch(records, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record), keepalive: true })
        .then((answer) => {
          if (answer.status === 204) stored();
          return answer.text();
        })
        .catch(() => {});
    } catch {
      // The browser refused to send it: it waits for a later page view.
    }
  };
  // The records that wait from an earlier page are sent once more, and then
  // given up.
  const waiting = kept();
  if (sending && unsent(waiting).length > 0) {
    keep(own(waiting));
    for (const record of unsent(waiting)) send(record);
  }

  // A necessary service is always allowed; any other once the visitor
  // allowed it, by its category or on its own.
  const allowsService = (service) => categoryOf.get(service) === 'necessary' || choice?.services[service] === true;
  const allowsCategory = (category) => category === 'necessary' || choice?.categories?.[category] === true;

  // A random consent ID, made with the first choice and kept with every
  // later one: a version 4 UUID.
  const newId = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };

  // The storage items withdrawing removes, a `*` in a name standing for
  // any characters.
  const matcher = (pattern) => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  const remove = ({ name: pattern, kind }) => {
    const matches = matcher(pattern);
    if (kind === 'cookie') {
      const found = document.cookie.split(';').map((pair) => pair.split('=')[0].trim()).filter((cookie) => matches.test(cookie));
      const parts = location.hostname.split('.');
      const domains = ['', ...parts.map((_, index) => parts.slice(index).join('.'))];
      const segments = location.pathname.split('/');
      const paths = new Set(['/', ...segments.map((_, index) => segments.slice(0, index + 1).join('/')).filter(Boolean)]);
      for (const cookie of found) {
        for (const domain of domains) {
          for (const path of paths) document.cookie = `${cookie}=; Max-Age=0; Path=${path}${domain ? `; Domain=${domain}` : ''}`;
        }
      }
      return;
    }
    const area = kind === 'localStorage' ? localStorage : sessionStorage;
    for (let index = area.length - 1; index >= 0; index -= 1) {
      const key = area.key(index);
      if (key !== null && matches.test(key)) area.removeItem(key);
    }
  };

  // The visitor allows exactly `allowed`, the ids of services, and the
  // necessary ones; a category is allowed when each of its services is.
  // `how`: banner, dialog, placeholder or withdrawal; `control`: accept,
  // reject, save, allow or withdraw.
  //
  // A choice that withdraws consent, to every optional service with
  // Withdraw consent or to some of them in the dialog, removes what each
  // service withdrawn from stored that the page can reach, after the event,
  // and reloads the page, so that none of their code keeps running.
  const choose = (allowed, how, control) => {
    const before = [...categoryOf.keys()].filter(allowsService);
    const services = Object.fromEntries([...categoryOf].map(([service, category]) => [service, category === 'necessary' || allowed.has(service)]));
    const categories = Object.fromEntries(Object.entries(registry.categories).map(([category, ids]) => [category, ids.every((id) => services[id])]));
    const last = kept();
    // Each choice is later than the last, even two in one millisecond, so
    // that its time tells its record from any other of its consent ID.
    const time = new Date(Math.max(Date.now(), (Date.parse(last?.time) || 0) + 1)).toISOString();
    choice = { id: last?.id ?? newId(), time, revision: registry.revision, categories, services };
    if (sending) {
      const record = { id: choice.id, chosen: time, revision: registry.revision, categories, services, how, control, path: location.pathname, language: registry.language };
      keep({ ...choice, unsent: [...unsent(last), record] });
      send(record);
    } else {
      keep(choice);
    }
    if (banner) banner.hidden = true;
    document.dispatchEvent(new CustomEvent('konzilo:consent', { detail: { choice: copy(choice), how } }));
    const withdrawn = how === 'withdrawal' ? Object.keys(registry.storage) : before.filter((service) => !allowsService(service));
    if (how !== 'withdrawal' && withdrawn.length === 0) return;
    for (const service of withdrawn) {
      for (const item of registry.storage[service] ?? []) remove(item);
    }
    location.reload();
  };
  const withdraw = () => choose(new Set(), 'withdrawal', 'withdraw');

  // The dialog's switches, set to what the visitor allows; a category's is
  // on when each of its services' is.
  const switches = (selector) => (dialog ? [...dialog.querySelectorAll(selector)] : []);
  const sync = () => {
    for (const input of switches('input[data-konzilo-consent-category]:not(:disabled)')) {
      const own = switches(`input[data-konzilo-consent-service][data-konzilo-consent-in="${input.dataset.konziloConsentCategory}"]`);
      input.checked = own.length > 0 && own.every((service) => service.checked);
    }
  };
  let opener = null;
  const open = () => {
    if (!dialog || dialog.open) return;
    for (const input of switches('input[data-konzilo-consent-service]')) input.checked = allowsService(input.dataset.konziloConsentService);
    sync();
    opener = document.activeElement;
    dialog.showModal();
  };
  dialog?.addEventListener('close', () => {
    if (opener?.isConnected && !opener.closest('[hidden]')) opener.focus();
    opener = null;
  });
  // A modal dialog leaves the rest of the page inert, but lets Tab go on to
  // the browser's own controls: past its last control the focus goes back
  // to its first, and the other way round.
  dialog?.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('a[href], button, input, summary, [tabindex]:not([tabindex="-1"])')]
      .filter((control) => !control.disabled && control.getClientRects().length > 0);
    const [first, last] = [controls[0], controls.at(-1)];
    if (!first) return;
    if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });
  dialog?.addEventListener('change', (event) => {
    const category = event.target.dataset?.konziloConsentCategory;
    if (category) {
      for (const input of switches(`input[data-konzilo-consent-service][data-konzilo-consent-in="${category}"]`)) input.checked = event.target.checked;
    }
    sync();
  });

  const everything = () => new Set(categoryOf.keys());
  const allowed = () => new Set([...categoryOf.keys()].filter(allowsService));
  const actions = {
    accept: (how) => choose(everything(), how, 'accept'),
    reject: (how) => choose(new Set(), how, 'reject'),
    save: () => choose(new Set(switches('input[data-konzilo-consent-service]:checked').map((input) => input.dataset.konziloConsentService)), 'dialog', 'save'),
  };
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-konzilo-consent-action]');
    if (!button) return;
    const action = button.dataset.konziloConsentAction;
    const inDialog = dialog?.contains(button) ?? false;
    if (action === 'customise' || action === 'change') open();
    else if (action === 'withdraw') withdraw();
    else if (action === 'close') dialog?.close();
    else if (actions[action]) {
      actions[action](inDialog ? 'dialog' : 'banner');
      if (inDialog) dialog.close();
    }
  });

  // The consent signal.
  Object.defineProperty(window, 'konziloConsent', {
    value: Object.freeze({
      category: (category) => allowsCategory(category),
      service: (service) => allowsService(service),
      choice: () => (choice ? copy(choice) : null),
      allow: (service, how = 'placeholder') => {
        if (categoryOf.has(service)) choose(new Set([...allowed(), service]), how, 'allow');
      },
    }),
  });

  // Without JavaScript neither the banner nor the footer's buttons show;
  // with it, the buttons, and the banner while no choice holds.
  if (dialog) {
    for (const button of document.querySelectorAll('button[data-konzilo-consent-action][hidden]')) button.hidden = false;
  }
  if (banner && !choice) banner.hidden = false;
}
