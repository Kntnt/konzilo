// Each feed's address, the integration's own route (feeds.js), injected
// once for each feed the site description declares: a type's feed, and the
// feed of each term a published post carries, by its slug. On a site in
// several languages each language has each feed below its prefix, which
// holds that language's posts, at their addresses under its prefix, with
// that language's settings.

import { getImage } from 'astro:assets';
import { getCollection, getEntries, getEntry, render } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { feedOfRoute, feedTerms, FEED_CONTENT_TYPE, siteFeed } from '../feeds.js';
import { publicSite } from '../public-site.js';
import { describedSite } from '../languages.js';
import { siteSettings } from '../site-settings.js';

export const prerender = true;

export async function getStaticPaths({ routePattern }) {
  const feed = feedOfRoute(describedSite(), routePattern);
  if (!feed?.taxonomy) return [{ params: {} }];
  return (await feedTerms(feed, getCollection, describedSite().languages)).map((slug) => ({ params: { slug } }));
}

let container;

// An entry's body as the site renders it, its images made, as HTML.
async function bodyOf(entry) {
  container ??= await AstroContainer.create();
  const { Content } = await render(entry);
  return container.renderToString(Content);
}

export async function GET({ routePattern, params }) {
  const { origin, languageTag } = publicSite();
  const site = describedSite();
  // The settings of the feed's language, by its address's prefix.
  const feed = feedOfRoute(site, routePattern);
  const settings = await siteSettings(feed ? new URL(feed.address.replace('{slug}', params.slug ?? ''), origin) : null);
  const text = await siteFeed(
    { site, pattern: routePattern, slug: params.slug ?? null, origin, languageTag, settings },
    { getCollection, getEntries, getEntry, getImage, bodyOf },
  );
  if (text === null) return new Response(null, { status: 404 });
  return new Response(text, { headers: { 'Content-Type': FEED_CONTENT_TYPE } });
}
