// Publishing in Sveltia: a field in each post's form, a page that lists every post, and a look at
// how things stand as soon as a save has been made.

import { say } from '../interface-language.js';
import { lookNow } from './status.js';
import { publishingField, publishingPage } from './view.js';
import { PUBLISHING_WIDGET } from './widget.js';

export function registerPublishing(CMS, config) {
  const site = config.site_url;
  CMS.registerFieldType(PUBLISHING_WIDGET, publishingField({ site }));
  CMS.registerCustomPage({ id: 'publishing', label: say('publishing.page'), icon: 'publish', component: publishingPage({ site, collectionOf: (name) => name }) });
  CMS.registerEventListener({ name: 'postSave', handler: () => lookNow() });
}
