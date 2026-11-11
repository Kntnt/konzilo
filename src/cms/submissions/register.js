// The Submissions page in Sveltia (ADR 0045), on a site that declares a form: each form's
// submissions, for Admins and Editors, and a form's as CSV.

import { say } from '../interface-language.js';
import { submissionsPage } from './view.js';

export function registerSubmissions(CMS) {
  CMS.registerCustomPage({ id: 'submissions', label: say('submissions.page'), icon: 'inbox', component: submissionsPage() });
}
