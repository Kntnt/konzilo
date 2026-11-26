// What a program that holds a clone of the source learns of the site's purges (ADR 0078), from the
// record of purges on its branch in the source repository, which only the instance's account
// writes: the branch's head, which each purge moves, and the record it holds, read once for each.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { PURGES_BRANCH, PURGES_FILE, purgeRecord } from './record.js';

// `token`: a credential that reads the source repository.
export function purgeRecordReader({ forgejo, repository, token, get = fetch }) {
  const ask = (path) => get(`${forgejo}/api/v1/repos/${repository}${path}`, { headers: { authorization: `token ${token}` } });
  let held = { head: undefined, record: purgeRecord(null) };
  const head = async () => {
    const answer = await ask(`/branches/${PURGES_BRANCH}`);
    if (answer.status === 404) return null;
    if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} about the record of purges`);
    return (await answer.json())?.commit?.id ?? null;
  };
  return {
    // The branch's head, or null where no purge was ever made.
    head,
    // The record, { purges, pushes }.
    async record() {
      const now = await head();
      if (now !== held.head) {
        let text = null;
        if (now !== null) {
          const answer = await ask(`/raw/${PURGES_FILE}?ref=${encodeURIComponent(now)}`);
          if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} for the record of purges`);
          text = await answer.text();
        }
        held = { head: now, record: purgeRecord(text) };
      }
      return held.record;
    },
  };
}

// Whether a purge was made since the last one a program took in, which it keeps in `file`:
// take() says so, and done() says that what take() saw last is taken in.
export function purgeMarks({ reader, file }) {
  let seen;
  return {
    async take() {
      seen = await reader.head();
      const kept = existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
      return (seen ?? '') !== (kept ?? '');
    },
    done() {
      if (seen !== undefined) writeFileSync(file, `${seen ?? ''}\n`);
    },
  };
}
