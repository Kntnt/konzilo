// `/sitemap-<number>.xml`, the integration's own route (sitemap.js): the
// numbered files of a sitemap of more addresses than one file may hold, none
// for a site with fewer.

import { getCollection } from 'astro:content';
import { origin } from '../public-site.js';
import { numbered, siteSitemap } from '../sitemap.js';

export const prerender = true;

export async function getStaticPaths() {
  const files = await siteSitemap(getCollection, origin());
  const paths = [];
  for (let number = 1; files.has(numbered(number)); number += 1) {
    paths.push({ params: { number: String(number) }, props: { text: files.get(numbered(number)) } });
  }
  return paths;
}

export function GET({ props }) {
  return new Response(props.text, { headers: { 'Content-Type': 'application/xml' } });
}
