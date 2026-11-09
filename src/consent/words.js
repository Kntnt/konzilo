// The words of the consent's markup that the core writes itself, in each of
// its languages, and the facts of a service in words. The consent texts an
// Admin may change are not here: a caller hands them in (markup.js).
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
    nothing: 'Its provider names nothing it stores',
    session: 'until you close the browser',
    persistent: 'with no end',
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
    declaration: {
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
      columns: ['Name', 'Kind', 'Lifetime', 'Party', 'Domain'],
      party: { first: 'First party', third: 'Third party' },
      nothing: 'Its provider names nothing it stores.',
      departures: 'Departures from the rules on consent',
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
    persistent: 'utan slut',
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
    declaration: {
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
      columns: ['Namn', 'Typ', 'Livslängd', 'Part', 'Domän'],
      party: { first: 'Förstapart', third: 'Tredjepart' },
      nothing: 'Leverantören anger inget som den lagrar.',
      departures: 'Avsteg från reglerna om samtycke',
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

// The language of the core's words for a page in `language`, a language
// tag such as sv-SE: Swedish for Swedish, and English for any other.
export function wordsLanguage(language) {
  return String(language ?? '').split(/[-_]/)[0].toLowerCase() === 'sv' ? 'sv' : 'en';
}

// The core's words for a page in `language`, a language tag.
export function wordsFor(language) {
  return WORDS[wordsLanguage(language)];
}

// Text with each `{name}` in `words` put in its place from `values`.
export function fill(words, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), words);
}

// The words the core writes itself of a service's facts, in the language
// of a page in `language`, a language tag: `country(code)`, a country's
// name by its ISO 3166-1 alpha-2 code; `kind(kind)`, a kind of storage; and
// `lifetime(value)`, how long an item is kept, from the registry's ISO 8601
// duration, `session` or `persistent`.
export function factWords(language) {
  const words = wordsFor(language);
  const regions = new Intl.DisplayNames([language], { type: 'region' });
  return {
    country: (code) => regions.of(code),
    kind: (kind) => words.kinds[kind],
    lifetime: (value) => {
      if (value === 'session' || value === 'persistent') return words[value];
      const [, time, number, unit] = /^P(T?)(\d+)([YMWDHS])$/.exec(value);
      return new Intl.NumberFormat(language, { style: 'unit', unit: UNITS[unit === 'M' && time ? 'TM' : unit], unitDisplay: 'long' }).format(Number(number));
    },
  };
}
