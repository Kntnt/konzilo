// `/robots.txt`, the integration's own route (robots.js), with the site
// settings, whose content signals it writes: on a site in several
// languages, the main language's, since no signal is translated.

import { origin } from '../public-site.js';
import { robotsTxt } from '../robots.js';
import { siteSettings } from '../site-settings.js';

export const prerender = true;

export async function GET() {
  const settings = await siteSettings();
  return new Response(await robotsTxt(origin(), settings), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
