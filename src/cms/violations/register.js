// The *Policy violations* page in Sveltia (ADR 0051), on every site, since every release has a
// policy: the counts of what it blocked on the site's pages, for an Admin alone, which the service
// decides.

import { say } from '../interface-language.js';
import { violationsPage } from './view.js';

export function registerViolations(CMS) {
  CMS.registerCustomPage({ id: 'violations', label: say('violations.page'), icon: 'policy', component: violationsPage() });
}
