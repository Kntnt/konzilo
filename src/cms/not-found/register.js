// The *Addresses not found* page in Sveltia (ADR 0040): the addresses visitors asked for in vain,
// for an Admin alone, which the service decides, with a rule made for each or the address hidden.

import { say } from '../interface-language.js';
import { notFoundPage } from './view.js';

// `config`: Sveltia's configuration, which names the source the rules are saved to.
export function registerNotFound(CMS, config) {
  CMS.registerCustomPage({ id: 'not-found', label: say('notFound.page'), icon: 'link_off', component: notFoundPage({ config }) });
}
