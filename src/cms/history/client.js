// What the editor asks of the service for a form's revisions (ADR 0074), with what Sveltia signed
// in with: a page at a time, newest first, each revision's file read through the form's own format,
// as its form reads it, into the flat map of values Sveltia holds a form's in.

import { askSignedIn } from '../service.js';
import { statusOf } from './compare.js';

const REVISIONS = '/_konzilo/revisions';

// A page of the revisions as the service gives them, each file's text unread.
async function pageOf({ path, page, credential, ask }) {
  const answer = await askSignedIn(`${REVISIONS}?${new URLSearchParams({ path, page: String(page) })}`, {}, { credential, ask });
  if (answer === null) throw new Error('nobody is signed in');
  if (!answer.ok) throw new Error(`the service answered ${answer.status}`);
  return answer.json();
}

// The latest save of the file at `path`, as its history has it: { account, moment }, `account` the
// one that pushed it as Forgejo recorded it, else null, and `moment` the push's, else the commit's
// own; or null where it has none, or the service cannot be asked.
export async function latestSaveOf({ path, credential, ask = (...args) => globalThis.fetch(...args) }) {
  try {
    const [latest] = (await pageOf({ path, page: 1, credential, ask })).revisions ?? [];
    return latest ? { account: latest.account ?? null, moment: latest.moment ?? null } : null;
  } catch {
    return null;
  }
}

// A page of the revisions of the file at `path`: { revisions, more }, each { commit, moment, account,
// values, status }, `values` null where the commit removed the file, or where it cannot be read
// through the form's format, which then says `unreadable`. `parse(text)` reads a file as the form
// does. Throws where the service cannot be asked or answers otherwise.
export async function revisionsOf({ path, page = 1, fields, parse, credential, ask = (...args) => globalThis.fetch(...args) }) {
  const { revisions, more } = await pageOf({ path, page, credential, ask });
  return {
    revisions: await Promise.all(revisions.map(async ({ commit, moment, account, text }) => {
      let values = null;
      let unreadable = false;
      if (typeof text === 'string') {
        try {
          values = await parse(text);
        } catch {
          unreadable = true;
        }
      }
      return { commit, moment, account, values, status: values ? statusOf({ fields, values }) : null, ...(unreadable ? { unreadable } : {}) };
    })),
    more: more === true,
  };
}
