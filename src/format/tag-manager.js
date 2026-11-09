// The tag manager: the core's settings group `tagManager`, which
// an Admin sets on the Site settings page, names what the public site loads
// to measure visits: Matomo Tag Manager, Matomo's own tracker or neither,
// with the instance's https:// address, the container's ID or the site's
// ID in Matomo, for the tracker a cookie domain where it is given, and who
// runs the instance. Either is a statistics service of the service
// registry (consent.js), with its own storage and the instance's host, so
// the security policy and the cookie declaration take it from there as they
// take every service; the page's script loads its container or its tracker
// (astro/tag-manager.js).
//
// tag-managers.json holds what the core knows of each tag manager it can
// load, by its service's id: the setting's option that chooses it
// (`label`), the service's name and purpose, where its container is below
// the instance's address, its own tracker where it has one (`tracker`: the
// option that chooses it, its purpose, and where its script and its
// endpoint are below the instance's address), what it stores in the
// visitor's browser, and the source of each fact with the day it was read.
// A tag manager joins by its entry there and its option in
// settings-groups.json.

import tagManagers from './tag-managers.json' with { type: 'json' };

// The settings group.
export const TAG_MANAGER_GROUP = 'tagManager';

// The consent event Konzilo pushes into the tag manager's data layer, and
// the key of the data layer that holds the consent, which a tag's trigger
// reads, such as konziloConsent.categories.statistics or
// konziloConsent.services.matomo: the public site's page script pushes it
// (astro/tag-manager.js).
export const CONSENT_EVENT = 'konzilo-consent';
export const CONSENT_KEY = 'konziloConsent';

// The departure that has the container load with the page, its tags reading
// the consent from the data layer.
export const BEFORE_CONSENT = 'tagManagerBeforeConsent';

// The countries of the EU and the EEA by their two-letter codes, Greece's
// as ISO 3166-1 has it (GR): an instance run in any other is a transfer of
// what visitors' browsers send it out of them.
const EU_AND_EEA = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  'IS', 'LI', 'NO',
]);

// The ids of the tag managers' services, which no service an Admin declares
// may take (coreServiceIds() in consent.js; PHP's Services::core_ids() reads
// the same file).
export function tagManagerIds() {
  return Object.keys(tagManagers);
}

// The instance's address without its last slash, its host in lowercase,
// and who runs it, from the group's settings.
function instanceOf(settings) {
  const address = new URL(settings.address);
  const { name, country, privacyPolicy } = settings.provider ?? {};
  return {
    base: `${address.origin}${address.pathname.replace(/\/+$/, '')}`,
    host: address.hostname,
    provider: name && country && privacyPolicy ? { name, country, privacyPolicy } : null,
  };
}

// The tag manager the settings choose, once they give all it needs, or null:
// { id, label, container, host, provider }, `container` the address of its
// container's script, `host` the instance's host in lowercase, and
// `provider` who runs the instance, { name, country, privacyPolicy }, or
// null for the site's publisher. `values` are the values of settings.json.
export function tagManagerOf(values) {
  const settings = values?.[TAG_MANAGER_GROUP];
  const id = Object.keys(tagManagers).find((key) => tagManagers[key].label === settings?.manager);
  if (!id || typeof settings.address !== 'string' || typeof settings.container !== 'string') return null;
  const { base, host, provider } = instanceOf(settings);
  return {
    id,
    label: tagManagers[id].label,
    container: tagManagers[id].container.replace('{address}', base).replace('{container}', settings.container),
    host,
    provider,
  };
}

// The tracker the settings choose, a tag manager's own, once they give all
// it needs, or null: { id, label, script, endpoint, site, cookieDomain,
// host, provider }, `script` and `endpoint` the addresses of its script and
// of where it sends what it counts, `site` the site's ID in the instance,
// and `cookieDomain` the domain it keeps its cookies on, or null for the
// site's own host. `values` are the values of settings.json.
export function trackerOf(values) {
  const settings = values?.[TAG_MANAGER_GROUP];
  const id = Object.keys(tagManagers).find((key) => tagManagers[key].tracker?.label === settings?.manager);
  if (!id || typeof settings.address !== 'string' || !Number.isInteger(settings.site)) return null;
  const { tracker } = tagManagers[id];
  const { base, host, provider } = instanceOf(settings);
  return {
    id,
    label: tracker.label,
    script: tracker.script.replace('{address}', base),
    endpoint: tracker.endpoint.replace('{address}', base),
    site: settings.site,
    cookieDomain: typeof settings.cookieDomain === 'string' && settings.cookieDomain !== '' ? settings.cookieDomain : null,
    host,
    provider,
  };
}

// The tag manager's or its tracker's service, for the registry's features:
// none while the settings choose neither, or leave out the instance's
// address, the container or the site's ID. A tracker with a cookie domain
// keeps its cookies there. Who runs the instance outside the EU and EEA
// receives what visitors' browsers send it there: a transfer to its
// country, on no safeguard the settings name. The site itself, its provider
// while none is given, names no country.
export function tagManagerServices({ settings }) {
  const container = tagManagerOf(settings);
  const tracker = container === null ? trackerOf(settings) : null;
  const chosen = container ?? tracker;
  if (chosen === null) return [];
  const facts = tagManagers[chosen.id];
  const onDomain = (item) => (tracker?.cookieDomain && item.kind === 'cookie' && item.party === 'first' ? { ...item, domain: tracker.cookieDomain } : item);
  return [{
    id: chosen.id,
    name: facts.name,
    category: 'statistics',
    provider: chosen.provider,
    purpose: tracker ? facts.tracker.purpose : facts.purpose,
    storage: facts.storage.map(onDomain),
    // The container's, the tag manager's and the tracker's scripts, and the
    // tracking requests, sent as requests or as images.
    hosts: { scripts: [chosen.host], connections: [chosen.host], images: [chosen.host] },
    transfers: chosen.provider && !EU_AND_EEA.has(chosen.provider.country) ? [{ country: chosen.provider.country, safeguards: [] }] : [],
  }];
}
