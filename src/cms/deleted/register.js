// The *Deleted* page in Sveltia (ADR 0077), for every Editor, Admins among them: the deleted posts,
// terms and image library entries, each read with its revisions and restored as a draft under its
// own ID.

import { say } from '../interface-language.js';
import { deletedPage } from './view.js';

// `history`: what registerHistory() gives. `lock`: what registerLock() gives.
export function registerDeleted(CMS, config, { history, lock }) {
  CMS.registerCustomPage({ id: 'deleted', label: say('deleted.page'), icon: 'restore_page', component: deletedPage({ config, history, lock }) });
}
