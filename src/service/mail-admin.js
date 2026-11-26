// What an Admin's *Mail* page asks of the service in its role for editors (ADR 0003, ADR 0045): how
// the site mails the forms' submissions, and how long it keeps them, to an Admin alone, an Editor
// told only that, and whoever may not write nothing. A save makes what waits to be tried again due
// at once, since what failed may now go, and forgets at once what is older than the retention it
// sets.

import { answerJson, answerMethods, asAdmin, jsonOf } from './answers.js';
import { FAILURE_SETTING, MAIL_SETTING } from './mail.js';
import { checkMailSettings, mailSettingsShown } from './mail-settings.js';
import { retentionDuty } from './retention.js';

export const MAIL_PAGE_PATH = '/_konzilo/mail';

// The most the page's settings take, as JSON.
const SETTINGS_LIMIT = 64 * 1024;

// The page's answers. `store`: as store.js opens it, or null. `forms()`: the forms the site
// description in use declares. `local`: whether this is a local copy, which sends no mail.
// `adminOf(credential)`: as answers.js's asAdmin() takes it. `now()`: the moment.
//
// Gives { owns(pathname), answer(incoming, outgoing) }.
export function mailPage({ store, forms, local, adminOf, now }) {
  return {
    owns: (pathname) => pathname === MAIL_PAGE_PATH,

    async answer(incoming, outgoing) {
      if (!['GET', 'PUT'].includes(incoming.method)) return answerMethods(incoming, outgoing, ['GET', 'PUT']);
      if (!store) {
        incoming.resume();
        return answerJson(outgoing, 404, {});
      }
      if (!await asAdmin(incoming, outgoing, adminOf)) return undefined;
      const shown = () => mailSettingsShown({ store, forms: forms(), local });
      if (incoming.method === 'GET') return answerJson(outgoing, 200, shown());
      const given = await jsonOf(incoming, outgoing, SETTINGS_LIMIT);
      if (given === undefined) return undefined;
      const checked = checkMailSettings(given, { store, forms: forms() });
      if (checked.problems) return answerJson(outgoing, 400, { problems: checked.problems });
      store.setSetting(MAIL_SETTING, checked.mail);
      for (const [form, settings] of Object.entries(checked.forms)) store.setFormSettings(form, settings);
      store.setSetting(FAILURE_SETTING, null);
      store.mailSoon(now());
      retentionDuty({ store, now }).run();
      return answerJson(outgoing, 200, shown());
    },
  };
}
