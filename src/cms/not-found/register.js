// The *Addresses not found* page in Sveltia (ADR 0040): the addresses visitors asked for in vain,
// for an Admin alone, which the service decides, with a rule made for each or the address hidden.

import { say } from '../interface-language.js';
import { notFoundPage } from './view.js';

// `config`: Sveltia's configuration, which names the source the rules are saved to. `lock`: what
// registerLock() gives, which refuses a rule while an Admin's purge waits or runs.
export function registerNotFound(CMS, config, { lock = null } = {}) {
  CMS.registerCustomPage({ id: 'not-found', label: say('notFound.page'), icon: 'link_off', component: notFoundPage({ config, lock }) });
}
