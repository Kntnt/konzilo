// `/llms.txt`, the integration's own route (llms-txt.js): the index of the
// pages that have a Markdown alternate, with the site settings, the main
// language's on a site in several languages.

import { getCollection } from 'astro:content';
import { LLMS_CONTENT_TYPE, llmsTxt } from '../llms-txt.js';
import { origin } from '../public-site.js';
import { describedSite } from '../languages.js';
import { siteSettings } from '../site-settings.js';

export const prerender = true;

export async function GET() {
  const settings = await siteSettings();
  const text = await llmsTxt({ settings, site: describedSite(), origin: origin() }, { getCollection });
  return new Response(text, { headers: { 'Content-Type': LLMS_CONTENT_TYPE } });
}
