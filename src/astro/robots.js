// The site's one robots.txt: every crawler may reach every
// address, and the sitemap on the public host is named.
//
// GROUP is the one place in the core where another part adds its lines
// inside the `User-agent: *` group, after `Allow: /`: each entry is a
// function of the public site, { origin, settings }, the site settings as
// Astro reads them, the main language's on a site in several (siteSettings()
// in site-settings.js, undefined while the site has none), that gives its
// lines, in order, at once or as a promise.
// The first is AI visibility's content signals.

import { contentSignals } from '../ai-visibility.js';
import { SITEMAP } from './sitemap.js';

// The address of robots.txt.
export const ROBOTS = '/robots.txt';

export const GROUP = [contentSignals];

// robots.txt for the public host `origin`, with the site settings
// `settings`.
export async function robotsTxt(origin, settings) {
  const added = (await Promise.all(GROUP.map((part) => part({ origin, settings })))).flat();
  return ['User-agent: *', 'Allow: /', ...added, '', `Sitemap: ${origin}${SITEMAP}`, ''].join('\n');
}
