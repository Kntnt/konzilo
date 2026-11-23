// What the editor asks of the service for a form's revisions (ADR 0074), with what Sveltia signed
// in with: a page at a time, newest first, each revision's file read through the form's own format,
// as its form reads it, into the flat map of values Sveltia holds a form's in.

import { statusOf } from './compare.js';

const REVISIONS = '/_konzilo/revisions';

// A page of the revisions of the file at `path`: { revisions, more }, each { commit, moment, account,
// values, status }, `values` null where the commit removed the file, or where it cannot be read
// through the form's format, which then says `unreadable`. `parse(text)` reads a file as the form
// does. Throws where the service cannot be asked or answers otherwise.
export async function revisionsOf({ path, page = 1, fields, parse, credential, ask = (...args) => globalThis.fetch(...args) }) {
  const held = credential();
  if (!held) throw new Error('nobody is signed in');
  const answer = await ask(`${REVISIONS}?${new URLSearchParams({ path, page: String(page) })}`, { headers: { authorization: held }, cache: 'no-store' });
  if (!answer.ok) throw new Error(`the service answered ${answer.status}`);
  const { revisions, more } = await answer.json();
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
