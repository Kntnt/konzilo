// The words of the consent's markup that the core writes itself, in each of
// its languages, and the facts of a service in words. The consent texts an
// Admin may change are not here: a caller hands them in (markup.js), save
// the defaults of the texts of the right to object, for a caller whose
// texts are older than it.
//
// This folder, src/consent/, imports nothing outside itself, so that a site
// that Konzilo does not build can copy it from a commit and call it.

// The words, by the language of the core's texts. `{…}` stands for what is
// put in its place.
const WORDS = {
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
    nothing: 'Its provider lists nothing that it stores',
    session: 'until you close the browser',
    persistent: 'until it is deleted',
    kinds: { cookie: 'cookie', localStorage: 'local storage', sessionStorage: 'session storage', other: 'other storage' },
    // Where an item is stored: on the host of the page, on a domain the
    // site shares with the sites below it, on a provider's domain, or on one
    // its provider does not name.
    on: 'on {domain}',
    thisHost: 'this site',
    shared: '{domain} and the sites below it',
    unnamedDomain: 'its provider\'s domain',
    // A placeholder's sentence on what its service may store and where its
    // data goes: with no provider, with one, and with one whose data may
    // leave the EU and EEA.
    placeholder: [
      '{service} may store data in your browser.',
      '{service} may store data in your browser, and {provider} ({country}) receives data about your visit.',
      '{service} may store data in your browser, and {provider} ({country}) receives data about your visit, which may be processed outside the EU and EEA.',
    ],
    // The default texts of the right to object to counting without storage,
    // for a page whose consent texts give none of their own: the same as the
    // consent texts' defaults (settings-groups.json, `objection*`).
    objection: {
      text: 'The counting without storage rests on the site\'s legitimate interest, and you may object to it at any time.',
      object: 'Don\'t count my visits',
      resume: 'Count my visits again',
      appeal: 'Do you really want us to stop counting your visits? We can\'t see who you are, and we don\'t follow you from one visit to the next. The figures help us understand what is valuable on the site and what we need to do better.',
      // The appeal where the visitor allows statistics, whose cookie does
      // recognise the browser between visits.
      appealAllowed: 'Do you really want us to stop counting your visits? You have allowed statistics, so for now we recognise your browser from one visit to the next. If you object, we turn that off and stop counting your visits altogether. The figures help us understand what is valuable on the site and what we need to do better.',
      confirm: 'Don\'t count my visits',
      cancel: 'Cancel',
    },
    declaration: {
      consent: 'Your choice',
      noScript: 'Your choice is shown here when JavaScript is turned on in your browser.',
      none: 'You have not made a choice yet, or your last one no longer applies.',
      asksNone: 'This site asks for no consent, since every service it uses counts as necessary.',
      id: 'Consent ID',
      given: 'Made',
      allows: 'Allows',
      services: 'Services and what they store',
      revised: 'The list was last changed on {date}.',
      provider: 'Provider',
      site: 'This site',
      privacyPolicy: '{provider}\'s privacy policy',
      purpose: 'Purpose',
      necessity: 'Why it is needed',
      hosts: 'Addresses your browser contacts',
      noHosts: 'None but this site\'s own',
      transfers: 'Transfers outside the EU and EEA',
      noTransfers: 'None',
      transfer: '{country}, on the basis of {safeguards}',
      unguarded: '{country}, with no safeguard its provider documents',
      unnamed: 'A country its provider does not name',
      safeguards: { adequacy: 'an adequacy decision', scc: 'standard contractual clauses', bcr: 'binding corporate rules' },
      stores: 'What {service} stores in your browser',
      columns: ['Name', 'Type', 'How long', 'Set by', 'Domain'],
      party: { first: 'This site', third: 'Its provider' },
      nothing: 'Its provider lists nothing that it stores.',
      departures: 'What this site does without your consent',
      departure: {
        necessaryService: '{service} counts as necessary on this site, so it is always on, without your consent.',
        tagManagerBeforeConsent: 'The site\'s tag manager loads before you make a choice, and the tags it loads follow your choice.',
        statisticsWithoutStorageBeforeConsent: 'The site\'s statistics count each visit from the first page you see, before you make a choice, without storing anything in your browser or reading anything from it, your device\'s properties included. They store in your browser only once you allow statistics.',
      },
      privacySignals: {
        stop: 'A browser that sends Global Privacy Control or Do Not Track is not counted at all.',
        ignore: 'A browser that sends Global Privacy Control or Do Not Track is counted too, without storage until you allow statistics.',
      },
      reason: 'The reason:',
    },
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
    persistent: 'tills den raderas',
    kinds: { cookie: 'kaka', localStorage: 'lokal lagring', sessionStorage: 'sessionslagring', other: 'annan lagring' },
    on: 'på {domain}',
    thisHost: 'den här webbplatsen',
    shared: '{domain} och webbplatserna under den',
    unnamedDomain: 'leverantörens domän',
    placeholder: [
      '{service} kan lagra uppgifter i din webbläsare.',
      '{service} kan lagra uppgifter i din webbläsare, och {provider} ({country}) tar emot uppgifter om ditt besök.',
      '{service} kan lagra uppgifter i din webbläsare, och {provider} ({country}) tar emot uppgifter om ditt besök, som kan behandlas utanför EU och EES.',
    ],
    objection: {
      text: 'Räkningen utan lagring bygger på webbplatsens berättigade intresse, och du kan när som helst invända mot den.',
      object: 'Räkna inte mina besök',
      resume: 'Räkna mina besök igen',
      appeal: 'Vill du verkligen att vi slutar räkna dina besök? Vi ser inte vem du är och följer dig inte mellan besök. Siffrorna hjälper oss att förstå vad som är värdefullt på webbplatsen och vad vi behöver göra bättre.',
      appealAllowed: 'Vill du verkligen att vi slutar räkna dina besök? Du har tillåtit statistik, så i dag känner vi igen din webbläsare mellan besök. Invänder du stänger vi av det och slutar räkna dina besök helt. Siffrorna hjälper oss att förstå vad som är värdefullt på webbplatsen och vad vi behöver göra bättre.',
      confirm: 'Räkna inte mina besök',
      cancel: 'Avbryt',
    },
    declaration: {
      consent: 'Ditt val',
      noScript: 'Ditt val visas här när JavaScript är påslaget i din webbläsare.',
      none: 'Du har inte gjort något val ännu, eller så gäller ditt förra val inte längre.',
      asksNone: 'Webbplatsen ber inte om samtycke, eftersom varje tjänst den använder räknas som nödvändig.',
      id: 'Samtyckes-ID',
      given: 'Gjort',
      allows: 'Tillåter',
      services: 'Tjänster och vad de lagrar',
      revised: 'Listan ändrades senast den {date}.',
      provider: 'Leverantör',
      site: 'Den här webbplatsen',
      privacyPolicy: 'Integritetspolicy för {provider}',
      purpose: 'Syfte',
      necessity: 'Varför den behövs',
      hosts: 'Adresser som din webbläsare kontaktar',
      noHosts: 'Inga andra än webbplatsens egna',
      transfers: 'Överföringar utanför EU och EES',
      noTransfers: 'Inga',
      transfer: '{country}, med stöd av {safeguards}',
      unguarded: '{country}, utan någon skyddsåtgärd som leverantören redovisar',
      unnamed: 'Ett land som leverantören inte namnger',
      safeguards: { adequacy: 'ett beslut om adekvat skyddsnivå', scc: 'standardavtalsklausuler', bcr: 'bindande företagsbestämmelser' },
      stores: 'Vad {service} lagrar i din webbläsare',
      columns: ['Namn', 'Typ', 'Hur länge', 'Sätts av', 'Domän'],
      party: { first: 'Den här webbplatsen', third: 'Leverantören' },
      nothing: 'Leverantören anger inget som den lagrar.',
      departures: 'Det här gör webbplatsen utan ditt samtycke',
      departure: {
        necessaryService: '{service} räknas som nödvändig på den här webbplatsen och är därför alltid på, utan ditt samtycke.',
        tagManagerBeforeConsent: 'Webbplatsens tagghanterare laddas innan du har gjort ett val, och taggarna den laddar följer ditt val.',
        statisticsWithoutStorageBeforeConsent: 'Webbplatsens statistik räknar varje besök från den första sidan du ser, innan du har gjort ett val, utan att lagra något i din webbläsare eller läsa något från den, inte heller din enhets egenskaper. Den lagrar i din webbläsare först när du tillåter statistik.',
      },
      privacySignals: {
        stop: 'En webbläsare som skickar Global Privacy Control eller Do Not Track räknas inte alls.',
        ignore: 'En webbläsare som skickar Global Privacy Control eller Do Not Track räknas också, utan lagring tills du tillåter statistik.',
      },
      reason: 'Skälet:',
    },
  },
};

// A lifetime's unit, in ISO 8601 (an M after T is minutes), as Intl names it.
const UNITS = { Y: 'year', M: 'month', W: 'week', D: 'day', H: 'hour', TM: 'minute', S: 'second' };

// The locale the core formats dates, times, numbers and countries in, by
// the language of its words: British English and Swedish as Sweden writes
// it, so that the words and the formats agree. A caller may give its own,
// by the same keys (formatLocale()).
export const LOCALES = Object.freeze({ en: 'en-GB', sv: 'sv-SE' });

// The language of the core's words for a page in `language`, a language
// tag such as sv-SE: Swedish for Swedish, and English for any other.
export function wordsLanguage(language) {
  return String(language ?? '').split(/[-_]/)[0].toLowerCase() === 'sv' ? 'sv' : 'en';
}

// The core's words for a page in `language`, a language tag.
export function wordsFor(language) {
  return WORDS[wordsLanguage(language)];
}

// The one locale a page in `language` formats dates, times, numbers and
// countries in, the build and the browser alike: `locales`' own for the
// language of its words, { en, sv }, else LOCALES'.
export function formatLocale(language, locales = {}) {
  const words = wordsLanguage(language);
  return locales?.[words] ?? LOCALES[words];
}

// Text with each `{name}` in `words` put in its place from `values`.
export function fill(words, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), words);
}

// The words the core writes itself of a service's facts, in the language
// of a page in `language`, a language tag, formatted in its locale
// (formatLocale(), with `locales`): `country(code)`, a country's name by
// its ISO 3166-1 alpha-2 code; `kind(kind)`, a kind of storage; and
// `lifetime(value)`, how long an item is kept, from the registry's ISO 8601
// duration, `session` or `persistent`.
export function factWords(language, locales) {
  const words = wordsFor(language);
  const locale = formatLocale(language, locales);
  const regions = new Intl.DisplayNames([locale], { type: 'region' });
  return {
    country: (code) => regions.of(code),
    kind: (kind) => words.kinds[kind],
    lifetime: (value) => {
      if (value === 'session' || value === 'persistent') return words[value];
      const [, time, number, unit] = /^P(T?)(\d+)([YMWDHS])$/.exec(value);
      return new Intl.NumberFormat(locale, { style: 'unit', unit: UNITS[unit === 'M' && time ? 'TM' : unit], unitDisplay: 'long' }).format(Number(number));
    },
  };
}
