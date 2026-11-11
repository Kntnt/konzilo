// The services an Admin declares, such as the advertiser's pixel a tag of the tag
// manager loads: each one joins the service registry (consent.js) with its facts.
// A host reaches the registry, and with it the security policy, only as part of
// such a service. A declaration names a host as an origin,
// `https://pixel.example.com`, and the registry holds it as a host, as it holds
// every service's. This module checks a service at every build. Each problem is a
// reason by its name in the core's catalogues, `refusal.service-…`, and the values
// that fill it (refusals.js), which the intake gives the Admin and the build writes in
// British English.

import { isObject } from '../checks.js';
import { SERVICE_ID } from '../site-description.js';
import { CATEGORIES, coreServiceIds, HOST_KINDS, LIFETIME, SAFEGUARDS, STORAGE_KINDS } from './consent.js';
import { suffixTakenIn } from './public-suffixes.js';

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const said = (name, values = {}) => ({ name, values });
const refused = (why, values) => ({ reason: said(`refusal.service-${why}`, values) });

// A host name: labels of a to z, digits and inner hyphens, at least two,
// the last a top-level domain, never an IP address.
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOST_NAME = new RegExp(`^(?:${LABEL}\\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$`);

// A public suffix or a shared domain of the Public Suffix List, by its section, as a
// refusal names it.
const SUFFIXES = { icann: 'public', private: 'shared' };

// A host a service names: an https:// origin, or a
// host name alone, either with `*.` before it for its subdomains, any case,
// with a final slash or none. `*.` may not take in a public suffix or a
// shared domain of the Public Suffix List (public-suffixes.js), the name it
// stands before or one below it, since anyone may have a host there.
// `adminHost` is the site's admin host, which no service may name, nor take
// in with `*.`; the Services screen also refuses the hosts visitors reach
// the site on, which only the shared server knows. Returns { host }, the
// host in lowercase as the registry holds it, or { reason }, a refusal by its name.
export function hostOf(text, { adminHost = null } = {}) {
  const given = typeof text === 'string' ? text.trim() : '';
  if (given === '*') return refused('host-any');
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/s.exec(given);
  let rest = given;
  if (scheme && !/^\d/.test(scheme[2])) {
    const name = scheme[1].toLowerCase();
    if (name === 'http') return refused('host-http');
    if (name !== 'https') return refused('host-scheme', { scheme: `${name}:` });
    if (!scheme[2].startsWith('//') || scheme[2] === '//') return refused('host-https-alone');
    rest = scheme[2].slice(2);
  }
  const end = rest.search(/[/?#]/);
  const authority = end === -1 ? rest : rest.slice(0, end);
  const after = end === -1 ? '' : rest.slice(end);
  if (after !== '' && after !== '/') return refused(after.startsWith('/') ? 'host-path' : after.startsWith('?') ? 'host-query' : 'host-fragment', { after });
  if (authority.includes('@')) return refused('host-user');
  const port = /:(\d*)$/.exec(authority);
  if (port) return refused('host-port', { port: port[0] });
  const host = authority.toLowerCase();
  if (/[^\x00-\x7f]/.test(host)) return refused('host-letters');
  const wildcard = host.startsWith('*.');
  const named = wildcard ? host.slice(2) : host;
  if (named.includes('*') || (wildcard && !HOST_NAME.test(named))) return refused('host-wildcard');
  if (!HOST_NAME.test(named) || named.length > 253) return refused('host-name');
  const shared = wildcard ? suffixTakenIn(named) : null;
  if (shared) return refused(`host-${SUFFIXES[shared.section]}${shared.each ? '-each' : ''}`, { suffix: shared.suffix });
  const covers = (own) => own === host || (wildcard && own.endsWith(`.${named}`));
  const admin = adminHost?.toLowerCase().replace(/:\d+$/, '');
  if (admin && covers(admin)) return host === admin ? refused('host-admin') : refused('host-admin-under', { admin });
  return { host };
}

// What a declared service holds, and the categories an Admin may
// give it; necessary comes only through a departure.
const FIELDS = ['id', 'name', 'category', 'provider', 'purpose', 'storage', 'hosts', 'transfers'];
const DECLARED_CATEGORIES = CATEGORIES.filter((category) => category !== 'necessary');
const COUNTRY = /^[A-Z]{2}$/;
const shown = (value) => JSON.stringify(value ?? null);

// The problems of a declared service, each { field, reason }, the
// field named by its path in the service, such as `provider.country` or
// `storage.2.lifetime`, a stored item, a host or a transfer counted from 1.
// Its hosts, as checked, go into `found`.
function problemsOf(kept, { adminHost, found }) {
  const problems = [];
  const add = (field, why, values) => problems.push({ field, ...refused(why, values) });
  if (typeof kept.id !== 'string' || !SERVICE_ID.test(kept.id)) add('id', 'id');
  if (!isText(kept.name)) add('name', 'name');
  if (kept.category === 'necessary') add('category', 'necessary');
  else if (!DECLARED_CATEGORIES.includes(kept.category)) add('category', 'category', { category: shown(kept.category) });
  if (!isObject(kept.provider)) {
    add('provider', 'provider');
  } else {
    const { name, country, privacyPolicy } = kept.provider;
    if (!isText(name)) add('provider.name', 'provider-name');
    if (typeof country !== 'string' || !COUNTRY.test(country)) add('provider.country', 'country', { country: shown(country), example: 'IE' });
    if (!isAddress(privacyPolicy)) add('provider.privacyPolicy', 'privacy-policy', { address: shown(privacyPolicy) });
    for (const key of Object.keys(kept.provider)) if (!['name', 'country', 'privacyPolicy'].includes(key)) add(`provider.${key}`, 'provider-part');
  }
  if (!isText(kept.purpose)) add('purpose', 'purpose');
  listed(kept.storage, 'storage', problems).forEach((item, index) => {
    const at = `storage.${index + 1}`;
    if (!isObject(item)) {
      add(at, 'storage-item');
      return;
    }
    if (!isText(item.name)) add(`${at}.name`, 'storage-name');
    if (!STORAGE_KINDS.includes(item.kind)) add(`${at}.kind`, 'storage-kind', { kind: shown(item.kind), kinds: { and: STORAGE_KINDS } });
    if (typeof item.lifetime !== 'string' || !LIFETIME.test(item.lifetime)) add(`${at}.lifetime`, 'storage-lifetime', { lifetime: shown(item.lifetime) });
    if (!['first', 'third'].includes(item.party)) add(`${at}.party`, 'storage-party', { party: shown(item.party) });
    for (const key of Object.keys(item)) if (!['name', 'kind', 'lifetime', 'party'].includes(key)) add(`${at}.${key}`, 'storage-part');
  });
  hostsOf(kept.hosts, { adminHost, found }, problems);
  listed(kept.transfers, 'transfers', problems).forEach((transfer, index) => {
    const at = `transfers.${index + 1}`;
    if (!isObject(transfer)) {
      add(at, 'transfer');
      return;
    }
    if (transfer.country !== null && (typeof transfer.country !== 'string' || !COUNTRY.test(transfer.country))) {
      add(`${at}.country`, 'country', { country: shown(transfer.country), example: 'US' });
    }
    const wrong = Array.isArray(transfer.safeguards) ? transfer.safeguards.find((safeguard) => !SAFEGUARDS.includes(safeguard)) : transfer.safeguards;
    if (!Array.isArray(transfer.safeguards) || wrong !== undefined) add(`${at}.safeguards`, 'safeguards', { safeguard: shown(wrong), safeguards: { and: SAFEGUARDS } });
    for (const key of Object.keys(transfer)) if (!['country', 'safeguards'].includes(key)) add(`${at}.${key}`, 'transfer-part');
  });
  for (const key of Object.keys(kept)) if (!FIELDS.includes(key)) add(key, 'part');
  return problems;
}

// A list a service holds, none given or an empty one being none; `field`, its
// name, is also the name of its refusal.
function listed(given, field, problems) {
  if (given === undefined) return [];
  if (Array.isArray(given)) return given;
  problems.push({ field, ...refused(field) });
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
    problems.push({ field: 'hosts', ...refused('hosts') });
    return;
  }
  for (const [kind, origins] of Object.entries(given)) {
    if (!HOST_KINDS.includes(kind)) {
      problems.push({ field: `hosts.${kind}`, ...refused('hosts-kind', { kinds: { and: HOST_KINDS } }) });
      continue;
    }
    if (!Array.isArray(origins)) {
      problems.push({ field: `hosts.${kind}`, ...refused('hosts-list') });
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
// out: { services, problems }, each problem { service: { id, name, number },
// field, reason }, `number` its place in the list from 1, and `field` null for
// what is no service at all. A service with a problem is none of `services`;
// nor is one with the id of a service of the core's or of another service
// before it. `adminHost` as hostOf() takes it.
export function declaredServices(given = [], { adminHost = null } = {}) {
  const services = [];
  const problems = [];
  const core = coreServiceIds();
  const seen = new Set();
  for (const [index, kept] of given.entries()) {
    const service = { id: isObject(kept) ? kept.id ?? null : null, name: isObject(kept) ? kept.name ?? null : null, number: index + 1 };
    const hosts = {};
    const found = isObject(kept) ? problemsOf(kept, { adminHost, found: hosts }) : [{ field: null, ...refused('shape') }];
    if (found.length === 0 && core.includes(kept.id)) found.push({ field: 'id', ...refused('core') });
    else if (found.length === 0 && seen.has(kept.id)) found.push({ field: 'id', ...refused('twice') });
    seen.add(service.id);
    if (found.length > 0) problems.push(...found.map((problem) => ({ service, ...problem })));
    else services.push(serviceOf(kept, hosts));
  }
  return { services, problems };
}
