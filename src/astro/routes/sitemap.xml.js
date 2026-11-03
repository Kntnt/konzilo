// `/sitemap.xml`, the integration's own route (sitemap.js): the site's
// sitemap, or the index of its numbered files.

import { getCollection } from 'astro:content';
import { origin } from '../public-site.js';
import { siteSitemap, SITEMAP } from '../sitemap.js';

export const prerender = true;

export async function GET() {
  const files = await siteSitemap(getCollection, origin());
  return new Response(files.get(SITEMAP), { headers: { 'Content-Type': 'application/xml' } });
}
