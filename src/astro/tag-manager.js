// The tag manager on the public site: the container of the tag
// manager the site settings choose (format/tag-manager.js), loaded by the
// page's own script file, tagManagerClient(), on a release built for the
// launched customer's domain alone. Its tags fire on the visitor's consent,
// which the script pushes into the tag manager's data layer.
//
// Where it loads: the build's environment says, in KONZILO_LAUNCHED, that the
// origin it builds for (KONZILO_ORIGIN) is the customer's domain after its
// launch: whoever runs the site sets it to 1 once the web server serves the
// domain. A build for the pre-launch address, a
// build below a base of its own (the preview and a share's preview), and
// Astro's dev server never load a container.
//
// When it loads: once the consent signal (src/consent/client.js) allows the tag
// manager's service, which is in statistics, in the same page view, at once
// on a later page; with the departure `tagManagerBeforeConsent` declared in
// the site description, with the page.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONSENT_FILE } from '../format/consent.js';
import { BEFORE_CONSENT, CONSENT_EVENT, CONSENT_KEY, tagManagerOf, trackerOf } from '../format/tag-manager.js';
import { isPublicBuild, origin } from './public-site.js';

// The variable of the build's environment that says the build is for the
// launched customer's domain.
export const LAUNCHED = 'KONZILO_LAUNCHED';

// The consent event and its key in the data layer.
export { CONSENT_EVENT, CONSENT_KEY };

// What the page's script needs to load the tag manager on a page of this
// build, or null when it loads none: `command` is Astro's (`build` or
// `dev`), `base` the build's base, `environment` the build's, `folder` the
// content folder the build reads, and `languages` the site's, as the site
// description reads them, whose main one's settings file holds the tag
// manager's settings, which are not translated.
//
// Returns { service, container, beforeConsent, event, key }: the id of the
// tag manager's service in the registry, the address of its container's
// script, whether the site departs to load it before consent, and the
// consent event's name and key. None either while the registry the build
// reads holds no such service, as when the settings were refused.
export function pageTagManager({ command, base, environment = process.env, folder, languages = [] }) {
  const built = launchedBuild({ command, base, environment, folder, languages });
  const chosen = built && tagManagerOf(built.settings);
  const { registry } = built ?? {};
  if (!chosen || !registry?.services?.some((service) => service.id === chosen.id)) return null;
  return {
    service: chosen.id,
    container: chosen.container,
    beforeConsent: registry.departures.some((departure) => departure.departure === BEFORE_CONSENT),
    event: CONSENT_EVENT,
    key: CONSENT_KEY,
  };
}

// The settings and the registry a release built for the launched
// customer's domain reads, or null for any other build.
function launchedBuild({ command, base, environment, folder, languages }) {
  if (command !== 'build' || !isPublicBuild(base) || environment[LAUNCHED] !== '1') return null;
  const read = (path) => {
    const file = join(folder, path);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  };
  return { settings: read(languages.length > 1 ? `settings/${languages[0].tag}.json` : 'settings.json'), registry: read(CONSENT_FILE) };
}

// What the page's script needs to load Matomo's own tracker on a page of
// this build, or null when it loads none, taking what pageTagManager()
// takes, and `warn`, which is told of a cookie domain the build's host is
// neither at nor below, which the tracker then leaves out. Returns the
// client's options of matomoTracker() (src/consent/client.js): { service,
// script, endpoint, site, cookieDomain }. None while the registry the build
// reads holds no such service.
export function pageTracker({ command, base, environment = process.env, folder, languages = [], warn = () => {} }) {
  const built = launchedBuild({ command, base, environment, folder, languages });
  const chosen = built && trackerOf(built.settings);
  if (!chosen || !built.registry?.services?.some((service) => service.id === chosen.id)) return null;
  let { cookieDomain } = chosen;
  const host = new URL(origin(environment)).hostname;
  if (cookieDomain && host !== cookieDomain && !host.endsWith(`.${cookieDomain}`)) {
    warn(`Matomo's cookie domain is ${cookieDomain}, which the public host ${host} is neither at nor below, so Matomo keeps its cookies on the host`);
    cookieDomain = null;
  }
  return { service: chosen.id, script: chosen.script, endpoint: chosen.endpoint, site: chosen.site, cookieDomain };
}

// The script of the tag manager, which the integration puts into every
// page's script file after the consent client's, so that it reads the
// consent signal. It runs in the visitor's browser, so it uses nothing from
// this module: `config` is pageTagManager()'s, or null for a build that
// loads no tag manager.
//
// It pushes the visitor's consent into Matomo's data layer, `_mtm`, as one
// event, `{ event, [key]: { categories, services } }`, each category's and
// each service's state by the registry's ids as the banner component's data
// gives them: once when the page has read the stored choice, and again at
// every choice. It then loads the container, with Matomo's start event
// before it, as Matomo's own snippet does, but from this file and without
// inline code: once the signal allows the service, or at once with the
// departure. Nothing reloads; withdrawing consent reloads the page itself,
// and a later page loads no container.
export function tagManagerClient(config) {
  if (config === null || 'konziloTagManager' in window) return;
  Object.defineProperty(window, 'konziloTagManager', { value: true });
  const signal = window.konziloConsent;
  let categories = {};
  try {
    categories = JSON.parse(document.querySelector('[data-konzilo-consent]').dataset.konziloConsent).categories ?? {};
  } catch {
    // A page without the registry tells no category or service.
  }
  const allows = (kind, id) => (signal ? signal[kind](id) === true : false);
  const layer = (window._mtm = window._mtm || []);
  const push = () => layer.push({
    event: config.event,
    [config.key]: {
      categories: Object.fromEntries(Object.keys(categories).map((id) => [id, allows('category', id)])),
      services: Object.fromEntries(Object.values(categories).flat().map((id) => [id, allows('service', id)])),
    },
  });
  let loaded = false;
  const load = () => {
    if (loaded || !(config.beforeConsent || allows('service', config.service))) return;
    loaded = true;
    layer.push({ 'mtm.startTime': Date.now(), event: 'mtm.Start' });
    const script = document.createElement('script');
    script.async = true;
    script.src = config.container;
    document.head.append(script);
  };
  push();
  load();
  document.addEventListener('konzilo:consent', () => {
    push();
    load();
  });
}
