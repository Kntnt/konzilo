// `/llms-full.txt`, the integration's own route (llms-txt.js): its heading
// and a place for each page's Markdown alternate, which a build fills once
// it has written them, and Astro's dev server once it has converted them,
// with the site settings, the main language's on a site in several
// languages.

import { getCollection } from 'astro:content';
import { LLMS_CONTENT_TYPE, llmsFullPlan } from '../llms-txt.js';
import { describedSite } from '../languages.js';
import { siteSettings } from '../site-settings.js';

export const prerender = true;

export async function GET() {
  const settings = await siteSettings();
  const text = await llmsFullPlan({ settings, site: describedSite() }, { getCollection });
  return new Response(text, { headers: { 'Content-Type': LLMS_CONTENT_TYPE } });
}
