// The *Purge a passage* page in Sveltia (ADR 0078), beside the *Deleted* page, for an Admin alone:
// a passage found in every revision of the source, and purged from every old one once no current
// version holds it.

import { say } from '../interface-language.js';
import { passagePage } from './view.js';

export function registerPassage(CMS, config) {
  CMS.registerCustomPage({ id: 'purge-passage', label: say('passage.page'), icon: 'ink_eraser', component: passagePage({ config }) });
}
