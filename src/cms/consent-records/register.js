// The *Consent records* page in Sveltia (ADR 0049): the record of each choice visitors make in the
// site's consent, which an Admin alone sees, finds by consent ID and downloads.

import { say } from '../interface-language.js';
import { consentRecordsPage } from './view.js';

export function registerConsentRecords(CMS) {
  CMS.registerCustomPage({ id: 'consent-records', label: say('consentRecords.page'), icon: 'fact_check', component: consentRecordsPage() });
}
