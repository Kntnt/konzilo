// The services an Admin declares, such as the advertiser's pixel a tag of the tag
// manager loads: each one joins the service registry (consent.js) with its facts.
// A host reaches the registry, and with it the security policy, only as part of
// such a service. A declaration names a host as an origin,
// `https://pixel.example.com`, and the registry holds it as a host, as it holds
// every service's. This module checks a service at every build.


const isText = (value) => typeof value === 'string' && value.trim() !== '';

import { isObject } from '../checks.js';
import { SERVICE_ID } from '../site-description.js';
import { CATEGORIES, coreServiceIds, HOST_KINDS, LIFETIME, SAFEGUARDS, STORAGE_KINDS } from './consent.js';
import { suffixTakenIn } from './public-suffixes.js';

// The words that end a refused host's reason: what a host looks like.
const EXAMPLE = 'such as https://pixel.example.com';

// A host name: labels of a to z, digits and inner hyphens, at least two,
// the last a top-level domain, never an IP address.
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOST_NAME = new RegExp(`^(?:${LABEL}\\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$`);

// What a public suffix or a shared domain of the Public Suffix List is, by
// its section, as a refusal names it.
const SUFFIXES = {
  icann: 'public suffix, under which anyone may register a domain',
  private: 'shared domain, under which anyone may have a host',
};

// A host a service names: an https:// origin, or a
// host name alone, either with `*.` before it for its subdomains, any case,
// with a final slash or none. `*.` may not take in a public suffix or a
// shared domain of the Public Suffix List (public-suffixes.js), the name it
// stands before or one below it, since anyone may have a host there.
// `adminHost` is the site's admin host, which no service may name, nor take
// in with `*.`; the Services screen also refuses the hosts visitors reach
// the site on, which only the shared server knows. Returns { host }, the
// host in lowercase as the registry holds it, or { reason }, in words an
// Admin reads.
export function hostOf(text, { adminHost = null } = {}) {
  const given = typeof text === 'string' ? text.trim() : '';
  if (given === '*') return { reason: `* would let the pages reach every host; name each host, ${EXAMPLE}` };
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/s.exec(given);
  let rest = given;
  if (scheme && !/^\d/.test(scheme[2])) {
    const name = scheme[1].toLowerCase();
    if (name === 'http') return { reason: 'http: is not encrypted, and the site reaches other hosts only over https://' };
    if (name !== 'https') return { reason: `only an https:// host can be declared, not ${name}:, ${EXAMPLE}` };
    if (!scheme[2].startsWith('//') || scheme[2] === '//') return { reason: `https: alone would let the pages reach every host; name each host, ${EXAMPLE}` };
    rest = scheme[2].slice(2);
  }
  const end = rest.search(/[/?#]/);
  const authority = end === -1 ? rest : rest.slice(0, end);
  const after = end === -1 ? '' : rest.slice(end);
  if (after !== '' && after !== '/') {
    const part = after.startsWith('/') ? 'a path' : after.startsWith('?') ? 'a query' : 'a fragment';
    return { reason: `has ${part}, ${after}; declare the host alone, ${EXAMPLE}` };
  }
  if (authority.includes('@')) return { reason: `holds a user name or a password; declare the host alone, ${EXAMPLE}` };
  const port = /:(\d*)$/.exec(authority);
  if (port) return { reason: `has a port, ${port[0]}; the site reaches other hosts only on the port of https://` };
  const host = authority.toLowerCase();
  if (/[^\x00-\x7f]/.test(host)) {
    return { reason: 'holds letters outside a to z; write the host name as its xn-- form, such as xn--bcher-kva.example for bücher.example' };
  }
  const wildcard = host.startsWith('*.');
  const named = wildcard ? host.slice(2) : host;
  if (named.includes('*') || (wildcard && !HOST_NAME.test(named))) {
    return { reason: '* stands only for the subdomains of a host name, at its start, as in https://*.example.com' };
  }
  if (!HOST_NAME.test(named) || named.length > 253) return { reason: `is not a host name, ${EXAMPLE}` };
  const shared = wildcard ? suffixTakenIn(named) : null;
  if (shared) {
    const under = shared.each ? `the subdomains of ${shared.suffix}, each a` : `${shared.suffix}, a`;
    return { reason: `takes in every host under ${under} ${SUFFIXES[shared.section]}; name the provider's own hosts, such as https://*.example.com` };
  }
  const covers = (own) => own === host || (wildcard && own.endsWith(`.${named}`));
  const admin = adminHost?.toLowerCase().replace(/:\d+$/, '');
  if (admin && covers(admin)) {
    return { reason: host === admin ? 'is the site\'s admin host, which visitors never reach' : `takes in the site's admin host, ${admin}, which visitors never reach` };
  }
  return { host };
}

// What a declared service holds, and the categories an Admin may
// give it; necessary comes only through a departure.
const FIELDS = ['id', 'name', 'category', 'provider', 'purpose', 'storage', 'hosts', 'transfers'];
const DECLARED_CATEGORIES = CATEGORIES.filter((category) => category !== 'necessary');
const COUNTRY = /^[A-Z]{2}$/;
const list = (values) => `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;

// The problems of a declared service, each { field, reason }, the
// field named by its path in the service, such as `provider.country` or
// `storage.2.lifetime`, a stored item, a host or a transfer counted from 1.
// Its hosts, as checked, go into `found`.
function problemsOf(kept, { adminHost, found }) {
  const problems = [];
  const add = (field, reason) => problems.push({ field, reason });
  if (typeof kept.id !== 'string' || !SERVICE_ID.test(kept.id)) add('id', 'is not the id of a service: a to z, digits and hyphens, starting with a letter');
  if (!isText(kept.name)) add('name', 'the site cannot publish a service without its name');
  if (kept.category === 'necessary') add('category', 'necessary comes only through a departure in the site description; choose functional, statistics or marketing');
  else if (!DECLARED_CATEGORIES.includes(kept.category)) add('category', `${JSON.stringify(kept.category ?? null)} is no category; choose functional, statistics or marketing`);
  if (!isObject(kept.provider)) {
    add('provider', 'the site cannot publish a service without its provider: the legal name, the country and the privacy policy');
  } else {
    const { name, country, privacyPolicy } = kept.provider;
    if (!isText(name)) add('provider.name', 'the site cannot publish a service without its provider\'s legal name');
    if (typeof country !== 'string' || !COUNTRY.test(country)) add('provider.country', `${JSON.stringify(country ?? null)} is not a country's two-letter code, such as IE`);
    if (!isAddress(privacyPolicy)) add('provider.privacyPolicy', `${JSON.stringify(privacyPolicy ?? null)} is not the https:// address of the provider's privacy policy`);
    for (const key of Object.keys(kept.provider)) if (!['name', 'country', 'privacyPolicy'].includes(key)) add(`provider.${key}`, 'is no part of a service\'s provider');
  }
  if (!isText(kept.purpose)) add('purpose', 'the site cannot publish a service without its purpose');
  listed(kept.storage, 'storage', 'must list what the service stores in the browser', problems).forEach((item, index) => {
    const at = `storage.${index + 1}`;
    if (!isObject(item)) {
      add(at, 'is not a stored item');
      return;
    }
    if (!isText(item.name)) add(`${at}.name`, 'the site cannot publish a stored item without its name');
    if (!STORAGE_KINDS.includes(item.kind)) add(`${at}.kind`, `${JSON.stringify(item.kind ?? null)} is no kind of storage; the kinds are ${list(STORAGE_KINDS)}`);
    if (typeof item.lifetime !== 'string' || !LIFETIME.test(item.lifetime)) {
      add(`${at}.lifetime`, `${JSON.stringify(item.lifetime ?? null)} is no lifetime: session, persistent, or a duration of one unit, such as P3M or PT30M`);
    }
    if (!['first', 'third'].includes(item.party)) add(`${at}.party`, `${JSON.stringify(item.party ?? null)} is neither first nor third party`);
    for (const key of Object.keys(item)) if (!['name', 'kind', 'lifetime', 'party'].includes(key)) add(`${at}.${key}`, 'is no part of a stored item');
  });
  hostsOf(kept.hosts, { adminHost, found }, problems);
  listed(kept.transfers, 'transfers', 'must list the countries outside the EU and EEA the data goes to', problems).forEach((transfer, index) => {
    const at = `transfers.${index + 1}`;
    if (!isObject(transfer)) {
      add(at, 'is not a transfer');
      return;
    }
    if (transfer.country !== null && (typeof transfer.country !== 'string' || !COUNTRY.test(transfer.country))) {
      add(`${at}.country`, `${JSON.stringify(transfer.country ?? null)} is not a country's two-letter code, such as US`);
    }
    const wrong = Array.isArray(transfer.safeguards) ? transfer.safeguards.find((safeguard) => !SAFEGUARDS.includes(safeguard)) : transfer.safeguards;
    if (!Array.isArray(transfer.safeguards) || wrong !== undefined) {
      add(`${at}.safeguards`, `${JSON.stringify(wrong ?? null)} is no safeguard; the safeguards are ${list(SAFEGUARDS)}`);
    }
    for (const key of Object.keys(transfer)) if (!['country', 'safeguards'].includes(key)) add(`${at}.${key}`, 'is no part of a transfer');
  });
  for (const key of Object.keys(kept)) if (!FIELDS.includes(key)) add(key, 'is no part of a service an Admin declares');
  return problems;
}

// A list a service holds, none given or an empty one being none.
function listed(given, field, reason, problems) {
  if (given === undefined) return [];
  if (Array.isArray(given)) return given;
  problems.push({ field, reason });
  return [];
}

// Whether text is an https:// address on a host name, such as a privacy
// policy's.
function isAddress(text) {
  if (typeof text !== 'string' || !text.startsWith('https://') || /[\s<>"{}|\\^`\x00-\x1f\x7f]/.test(text)) return false;
  const authority = text.slice('https://'.length).split(/[/?#]/)[0];
  return !authority.includes('@') && HOST_NAME.test(authority.replace(/:\d+$/, '').toLowerCase());
}

// The hosts of each kind of request, checked, into `found`; none given is
// none of any kind, as is an empty list, which PHP writes for an empty
// array.
function hostsOf(given, { adminHost, found }, problems) {
  if (given === undefined || (Array.isArray(given) && given.length === 0)) return;
  if (!isObject(given)) {
    problems.push({ field: 'hosts', reason: 'the site cannot publish this as the hosts of each kind of request' });
    return;
  }
  for (const [kind, origins] of Object.entries(given)) {
    if (!HOST_KINDS.includes(kind)) {
      problems.push({ field: `hosts.${kind}`, reason: `is no kind of request; the kinds are ${list(HOST_KINDS)}` });
      continue;
    }
    if (!Array.isArray(origins)) {
      problems.push({ field: `hosts.${kind}`, reason: 'must list hosts' });
      continue;
    }
    found[kind] = [];
    origins.forEach((origin, index) => {
      const checked = hostOf(origin, { adminHost });
      if (checked.reason) problems.push({ field: `hosts.${kind}.${index + 1}`, reason: checked.reason });
      else found[kind].push(checked.host);
    });
  }
}

// A service as the registry's features give it (docs/agents/consent.md),
// from a declared one, with its hosts as checked.
function serviceOf(kept, hosts) {
  return {
    id: kept.id,
    name: kept.name.trim(),
    category: kept.category,
    provider: { name: kept.provider.name.trim(), country: kept.provider.country, privacyPolicy: kept.provider.privacyPolicy },
    purpose: kept.purpose.trim(),
    storage: (kept.storage ?? []).map((item) => ({ name: item.name.trim(), kind: item.kind, lifetime: item.lifetime, party: item.party })),
    hosts,
    transfers: (kept.transfers ?? []).map((transfer) => ({ country: transfer.country, safeguards: SAFEGUARDS.filter((safeguard) => transfer.safeguards.includes(safeguard)) })),
  };
}

// The services a site declares, as its settings hand them
// out: { services, problems }, each problem { service: { id, name }, field,
// reason }. A service with a problem is none of `services`; nor is one with
// the id of a service of the core's or of another service before it.
// `adminHost` as hostOf() takes it.
export function declaredServices(given = [], { adminHost = null } = {}) {
  const services = [];
  const problems = [];
  const core = coreServiceIds();
  const seen = new Set();
  for (const kept of given) {
    const service = { id: isObject(kept) ? kept.id ?? null : null, name: isObject(kept) ? kept.name ?? null : null };
    const hosts = {};
    const found = isObject(kept) ? problemsOf(kept, { adminHost, found: hosts }) : [{ field: 'service', reason: 'is not a service' }];
    if (found.length === 0 && core.includes(kept.id)) found.push({ field: 'id', reason: 'is the id of a service of the core\'s' });
    else if (found.length === 0 && seen.has(kept.id)) found.push({ field: 'id', reason: 'another service an Admin declares has the same id' });
    seen.add(service.id);
    if (found.length > 0) problems.push(...found.map((problem) => ({ service, ...problem })));
    else services.push(serviceOf(kept, hosts));
  }
  return { services, problems };
}
