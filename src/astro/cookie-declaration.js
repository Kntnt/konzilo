// The cookie declaration: what CookieDeclaration.astro renders
// from the service registry after the body of the page the site settings
// choose as the cookie policy, and the script, cookieDeclaration(), that
// shows the visitor's own consent in it. Everything a visitor reads is
// rendered into the page in the site's language; the script only fills in
// the visitor's consent ID and the time of the choice, and shows or hides
// the rest. It is part of the integration's one script file, after the
// consent client (consent.js), whose signal it reads.

import { CONSENT_GROUP, textsOf } from '../format/consent.js';
import { textLanguage } from '../texts.js';
import { factWords, linkTo } from './consent.js';

// The words of the declaration the core writes itself, in each of its
// languages. `{…}` stands for what is put in its place.
const WORDS = {
  en: {
    consent: 'Your consent',
    noScript: 'Your own choice shows here only when your browser runs the site\'s script.',
    none: 'You have made no choice that holds on this site.',
    asksNone: 'This site asks for no consent, since every service it uses counts as necessary.',
    id: 'Consent ID',
    given: 'Given',
    allows: 'Allows',
    services: 'Services and what they store',
    revised: 'Last changed {date}.',
    provider: 'Provider',
    site: 'This site',
    privacyPolicy: 'Privacy policy of {provider}',
    purpose: 'Purpose',
    necessity: 'Why it is needed',
    hosts: 'Hosts it reaches',
    noHosts: 'None beyond this site',
    transfers: 'Transfers outside the EU and EEA',
    noTransfers: 'None',
    transfer: '{country}, on {safeguards}',
    unguarded: '{country}, on no safeguard its provider documents',
    unnamed: 'A country its provider does not name',
    safeguards: { adequacy: 'an adequacy decision', scc: 'standard contractual clauses', bcr: 'binding corporate rules' },
    stores: 'What {service} stores in your browser',
    columns: ['Name', 'Kind', 'Lifetime', 'Party'],
    party: { first: 'First party', third: 'Third party' },
    nothing: 'Its provider names nothing it stores.',
    departures: 'Departures from the rules on consent',
    departure: {
      necessaryService: '{service} counts as necessary on this site, so it is always on, without your consent.',
      tagManagerBeforeConsent: 'The site\'s tag manager loads before you make a choice, and the tags it loads follow your choice.',
    },
    reason: 'The reason:',
  },
  sv: {
    consent: 'Ditt samtycke',
    noScript: 'Ditt eget val visas här bara när din webbläsare kör webbplatsens skript.',
    none: 'Du har inget val som gäller på den här webbplatsen.',
    asksNone: 'Webbplatsen ber inte om samtycke, eftersom varje tjänst den använder räknas som nödvändig.',
    id: 'Samtyckes-ID',
    given: 'Lämnat',
    allows: 'Tillåter',
    services: 'Tjänster och vad de lagrar',
    revised: 'Senast ändrad {date}.',
    provider: 'Leverantör',
    site: 'Den här webbplatsen',
    privacyPolicy: 'Integritetspolicy för {provider}',
    purpose: 'Syfte',
    necessity: 'Varför den behövs',
    hosts: 'Värdar den når',
    noHosts: 'Inga utöver den här webbplatsen',
    transfers: 'Överföringar utanför EU och EES',
    noTransfers: 'Inga',
    transfer: '{country}, med stöd av {safeguards}',
    unguarded: '{country}, utan någon skyddsåtgärd som leverantören redovisar',
    unnamed: 'Ett land som leverantören inte namnger',
    safeguards: { adequacy: 'ett beslut om adekvat skyddsnivå', scc: 'standardavtalsklausuler', bcr: 'bindande företagsbestämmelser' },
    stores: 'Vad {service} lagrar i din webbläsare',
    columns: ['Namn', 'Typ', 'Livslängd', 'Part'],
    party: { first: 'Förstapart', third: 'Tredjepart' },
    nothing: 'Leverantören anger inget som den lagrar.',
    departures: 'Avsteg från reglerna om samtycke',
    departure: {
      necessaryService: '{service} räknas som nödvändig på den här webbplatsen och är därför alltid på, utan ditt samtycke.',
      tagManagerBeforeConsent: 'Webbplatsens tagghanterare laddas innan du har gjort ett val, och taggarna den laddar följer ditt val.',
    },
    reason: 'Skälet:',
  },
};

const fill = (words, values) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), words);

// Whether the page at `pathname`, as Astro.url has it, is the cookie
// policy the site settings choose, below the site's base.
export function isCookiePolicy(pathname, settings, base = '/') {
  const page = settings?.legalPages?.cookiePolicy;
  if (!page) return false;
  const normal = (path) => {
    try {
      return decodeURI(path).replace(/\/?$/, '/');
    } catch {
      return path;
    }
  };
  return normal(pathname) === normal(linkTo(page, base).href);
}

// What the declaration shows of the registry, in the site's language, the
// page's on a site in several.
//
// `registry`: the registry as Astro's collection `consent` hands it out.
// `settings`: the site settings, in the page's language, whose privacy
// policy a service of the site's own links to and whose consent texts and
// categories' names, as consentView() takes them, the declaration shows.
// `site`: { locale, languageTag, base }, as consentView() takes it.
//
// Returns { words, asks, revised, categories, departures, footer }: the
// declaration's own words; whether the registry asks for consent; the day
// it last changed, { before, date, datetime, after }, the date in words
// and as HTML's <time> takes it, between the words around it; each category with its services and
// all their facts, in the registry's order; each departure in plain words
// with its reason; and the footer's texts, which name the buttons.
export function declarationView(registry, settings, { locale, languageTag, base = '/' }) {
  const words = WORDS[textLanguage(locale)];
  const own = settings?.[CONSENT_GROUP];
  const { country, kind, lifetime } = factWords({ locale, languageTag });
  const services = new Map(registry.services.map((service) => [service.id, service]));
  const either = new Intl.ListFormat(languageTag, { type: 'disjunction' });
  const privacy = settings?.legalPages?.privacyPolicy ? linkTo(settings.legalPages.privacyPolicy, base) : null;
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
      : { name: words.site, country: null, privacyPolicy: privacy },
    purpose: service.purpose,
    necessity: service.necessity,
    hosts: [...new Set(Object.values(service.hosts).flat())].sort(),
    transfers: service.transfers.map(transfer),
    caption: fill(words.stores, { service: service.name }),
    storage: service.storage.map((item) => ({ name: item.name, kind: kind(item.kind), lifetime: lifetime(item.lifetime), party: words.party[item.party] })),
  });
  const revised = new Date(registry.revised instanceof Date ? registry.revised : `${registry.revised}T00:00:00Z`);
  const [before, after] = words.revised.split('{date}');
  return {
    words,
    asks: registry.categories.some((category) => category.id !== 'necessary'),
    revised: { before, date: new Intl.DateTimeFormat(languageTag, { dateStyle: 'long', timeZone: 'UTC' }).format(revised), datetime: revised.toISOString().slice(0, 10), after },
    categories: registry.categories.map((category) => ({
      id: category.id,
      name: own?.[`${category.id}Name`] ?? category.name,
      description: own?.[`${category.id}Description`] ?? category.description,
      necessary: category.id === 'necessary',
      services: category.services.map((id) => describe(services.get(id))),
    })),
    departures: registry.departures.map((departure) => ({
      text: fill(words.departure[departure.departure], { service: services.get(departure.service)?.name ?? departure.service }),
      reason: departure.reason,
    })),
    footer: own ? textsOf(own).footer : registry.texts.footer,
  };
}

// The script of the declaration, which the integration puts into every
// page's script file after the consent client's. It runs in the visitor's
// browser, so it uses nothing from this module.
//
// On a page with the declaration it shows the visitor's own consent from
// the consent signal: the consent ID, when the choice was made, in the
// page's language, and what it allows, each category it allows wholly and
// each service it allows in a category it does not; or that no choice
// holds. It hides the sentence that says the script has not run, and
// follows each later choice. The buttons beside it are the consent
// client's, which shows them.
export function cookieDeclaration() {
  const root = document.querySelector('[data-konzilo-declaration]');
  const consent = window.konziloConsent;
  const choice = root?.querySelector('.konzilo-declaration-choice');
  if (!consent || !choice) return;
  const none = root.querySelector('.konzilo-declaration-none');
  const id = choice.querySelector('[data-konzilo-declaration-id]');
  const time = choice.querySelector('[data-konzilo-declaration-time]');
  const show = () => {
    const current = consent.choice();
    none.hidden = current !== null;
    choice.hidden = current === null;
    if (!current) return;
    id.textContent = current.id;
    time.dateTime = current.time;
    time.textContent = new Intl.DateTimeFormat(document.documentElement.lang || undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(current.time));
    for (const item of choice.querySelectorAll('[data-konzilo-declaration-category]')) {
      item.hidden = current.categories[item.dataset.konziloDeclarationCategory] !== true;
    }
    for (const item of choice.querySelectorAll('[data-konzilo-declaration-service]')) {
      item.hidden = current.services[item.dataset.konziloDeclarationService] !== true || current.categories[item.dataset.konziloDeclarationIn] === true;
    }
  };
  root.querySelector('.konzilo-declaration-no-script').hidden = true;
  show();
  document.addEventListener('konzilo:consent', show);
}
