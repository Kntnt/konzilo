// The *Mail* page in Sveltia (ADR 0003, ADR 0045), on a site that declares a form: how the site
// mails each form's submissions, and to whom, for an Admin alone, which the service decides.

import { say } from '../interface-language.js';
import { mailPage } from './view.js';

export function registerMail(CMS) {
  CMS.registerCustomPage({ id: 'mail', label: say('mail.page'), icon: 'mail', component: mailPage() });
}
