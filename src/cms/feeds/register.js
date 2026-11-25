// The *Feeds* page in Sveltia (ADR 0079): the feeds of other sites the site reads, for an Admin
// alone, which the service decides.

import { say } from '../interface-language.js';
import { feedsPage } from './view.js';

export function registerFeeds(CMS) {
  CMS.registerCustomPage({ id: 'feeds', label: say('feeds.page'), icon: 'rss_feed', component: feedsPage() });
}
