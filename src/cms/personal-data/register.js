// The *Personal data* page in Sveltia (ADR 0045), on a site that declares a form: a person's
// submissions, which an Admin alone finds, downloads and erases.

import { say } from '../interface-language.js';
import { personalDataPage } from './view.js';

export function registerPersonalData(CMS) {
  CMS.registerCustomPage({ id: 'personal-data', label: say('personalData.page'), icon: 'person_search', component: personalDataPage() });
}
