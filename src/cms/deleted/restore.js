// Restoring a deleted post, term or image library entry (ADR 0077): its last revision is saved at
// once, at its own path, so under its own ID, a post as a draft, by one commit to the source
// repository made through Forgejo's API with what Sveltia signed in with, as Sveltia's own saves
// are, so that Forgejo records the Editor's push; then its form opens. A library entry comes back
// with its original where the deletion took that too (ADR 0063).
//
// It goes through the same guards as a save from a form (ADR 0073): the lock of the entry's form,
// held for the restore; and the check against the latest save, which is the deletion: where the
// entry was saved since, by a restore or anything else, it is refused, naming the account that
// pushed that save, and nothing is written. Forgejo itself refuses to make a file that is there. A
// save turned away because another commit came first is tried again, at most three times more,
// each time after the check is made anew; one answered with a server error that went in all the
// same is done.

import { parseDocument } from 'yaml';

import { base64 } from '../base64.js';
import { momentValue } from '../refusals.js';

const TRIES = 4;
const DRAFT = 'draft';
const FRONT_MATTER = /^---[ \t]*\n([\s\S]*?\n)?---([ \t]*(?:\n[\s\S]*)?)$/;
const STATUS = /^status[ \t]*:/;
const PLAIN_STATUS = /^status[ \t]*:[ \t]*(?:"[^"\n]*"|'[^'\n]*'|[\w-]+)[ \t]*$/;

const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');

// The ID of the entry a source file is, its name without its extension.
export const idOf = (path) => path.split('/').at(-1).replace(/\.[^.]*$/, '');

// The form an entry's source file is edited in, `<collection>/<ID>`, as the lock names it: a
// translation's is its entry's.
export const formOfEntry = ({ path, collection }) => `${collection}/${idOf(path)}`;

// A post's file with its status a draft: the status's line in its front matter rewritten where it
// holds the word alone, else the front matter written anew with it. A file with no status is a
// draft already, and stays as it is.
export function asDraft(text) {
  const found = FRONT_MATTER.exec(String(text).replace(/\r\n?/g, '\n'));
  if (!found) return text;
  const [, head = '', rest] = found;
  const lines = head.split('\n');
  const at = lines.findIndex((line) => STATUS.test(line));
  if (at === -1) return text;
  let made;
  if (PLAIN_STATUS.test(lines[at]) && !/^[ \t]/.test(lines[at + 1] ?? '')) {
    lines[at] = `status: ${DRAFT}`;
    made = lines.join('\n');
  } else {
    const document = parseDocument(head);
    document.set('status', DRAFT);
    made = String(document);
  }
  return `---\n${made}---${rest}`;
}

// The refusal of a restore after a later save, by the account that pushed it and its moment, as
// the history has them: `latest`, { account, moment }, or null.
const refusalOf = (latest) => {
  if (latest?.account?.name && latest.moment) return { name: 'deleted.refusedLater', values: { account: latest.account.name, moment: momentValue(latest.moment) } };
  if (latest?.moment) return { name: 'deleted.refusedLaterAt', values: { moment: momentValue(latest.moment) } };
  return { name: 'deleted.refusedLaterUnnamed' };
};

// Restores `entry`, as the service lists it: { path, collection, commit, last: { commit, text },
// along }, `commit` its deletion's. `api`: Forgejo's. `credential()`: what Sveltia signed in with.
// `lock`: the keeper's, which holds the form for the restore. `latestSave(path)`: the account and
// moment of the file's latest save, as its history has them, or null. `opened()`: opens its form,
// once it is saved, before the lock held for it goes. Gives { restored: true } or { refusal }, by its
// name and values; throws where Forgejo cannot be asked or answers otherwise.
export async function restoreDeleted({ entry, api, repository, branch = 'main', credential, ask = (...args) => globalThis.fetch(...args), lock, latestSave, opened = async () => {}, pause = (ms) => new Promise((go) => setTimeout(go, ms)) }) {
  const { path, collection } = entry;
  const held = await lock.beforeRestoring(formOfEntry(entry));
  if (held.refusal) return { refusal: held.refusal };
  try {
    const forgejo = async (address, init = {}) => {
      const signedIn = credential();
      if (!signedIn) throw new Error('nobody is signed in');
      return ask(`${api}/repos/${repository}${address}`, { ...init, headers: { ...init.headers, authorization: signedIn }, cache: 'no-store' });
    };
    const text = path.endsWith('.md') ? asDraft(entry.last.text) : entry.last.text;
    const files = [{ operation: 'create', path, content: base64(new TextEncoder().encode(text)) }];
    for (const along of entry.along ?? []) {
      const answer = await forgejo(`/media/${encodedPath(along)}?ref=${encodeURIComponent(entry.last.commit)}`);
      if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} for ${along}`);
      files.push({ operation: 'create', path: along, content: base64(new Uint8Array(await answer.arrayBuffer())) });
    }
    const newest = async () => {
      const answer = await forgejo(`/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}&limit=1&stat=false&files=false&verification=false`);
      if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} for the history of ${path}`);
      return (await answer.json())[0]?.sha ?? null;
    };
    const writtenSo = async () => {
      const answer = await forgejo(`/raw/${encodedPath(path)}?ref=${encodeURIComponent(branch)}`);
      return answer.ok && await answer.text() === text;
    };
    for (let tried = 1; ; tried += 1) {
      if (await newest() !== entry.commit) {
        if (tried > 1 && await writtenSo()) break;
        return { refusal: refusalOf(await latestSave(path)) };
      }
      const answer = await forgejo('/contents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ branch, message: `Restore ${collection} “${idOf(path)}”`, files }),
      });
      if (answer.ok) break;
      const again = [409, 422, 423].includes(answer.status) || answer.status >= 500;
      if (!again || tried >= TRIES) throw Object.assign(new Error(`Forgejo answered ${answer.status} to the restore of ${path}`), { status: answer.status });
      await pause(200 * tried + Math.random() * 400);
    }
    await opened();
    return { restored: true };
  } finally {
    await held.done();
  }
}
