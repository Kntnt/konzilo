// What the *Addresses not found* page asks of the service and of Forgejo (ADR 0040): the addresses
// visitors asked for in vain, as the service counts them, one hidden, and a rule made for one.
// *Redirect…* and *Answer 410* add the rule to the source's `redirects.json`, as an Admin's save of
// the redirect rules is (ADR 0036): one commit made through Forgejo's API with what Sveltia signed
// in with, so that Forgejo records the Admin's push, which the build goes by. The rules are checked
// first as the intake checks them, since a file it refuses holds up every rule in it; a rule it
// would refuse is not saved, and the reason is given, by its name and values. A save turned away
// because another commit came first is made again from the file as it is then, at most three times
// more; one answered with a server error that went in all the same is done. It holds no React.

import { base64 } from '../base64.js';
import { askAsAdmin, fetching } from '../service.js';
import { contentsPath, decodedContent } from '../source.js';
import { isSource, keyOf, reservedBy } from '../../format/redirects.js';
import { isPattern } from '../../format/patterns.js';
import { readRules } from '../../intake/rules-file.js';

const NOT_FOUND = '/_konzilo/not-found';
const REDIRECTS = 'redirects.json';
const TRIES = 4;
// A redirect made from the log leads on for good, as an old address does.
const REDIRECT = 301;
const GONE = 410;

// What the service answers, as the page takes it: { addresses }, { adminOnly } for one who may write
// and is no Admin, or null where it cannot be told.
const listedBy = (path, init, { credential, ask }) => askAsAdmin(path, init, {
  credential,
  ask,
  read: async (answer) => (answer.ok ? { addresses: (await answer.json()).addresses } : null),
});

// The addresses not found, most asked first, each { address, count, last }.
export const readNotFound = ({ credential, ask = fetching() }) => listedBy(NOT_FOUND, { method: 'GET' }, { credential, ask });

// An address hidden, and the addresses not found as they are then.
export const hideNotFound = ({ credential, address, ask = fetching() }) => listedBy(`${NOT_FOUND}/hidden`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) }, { credential, ask });

// Whether a rule may have an address as its source: a path as a browser sends it, which the core
// keeps for no file of its own.
export const ruleMayBeMade = (address) => isSource(address) && !address.includes('?') && reservedBy(address) === null;

// Whether a rule of the source answers an address already: an exact rule, without a query, at it,
// or at it with a last slash, which also answers without. One at it without its last slash answers
// it not, and the intake refuses a second, so the check says so.
const holds = (rule, address) => {
  const source = rule?.pattern ?? rule?.from;
  if (typeof source !== 'string' || isPattern(source) || !isSource(source) || source.includes('?')) return false;
  return keyOf(source) === keyOf(address) && (source.endsWith('/') || source === address);
};

const said = (problem) => JSON.stringify([problem.entry ?? null, problem.reason]);

/**
 * Adds a rule for `address` to the source's rules: a 301 to `to`, or, without `to`, a 410. `api`,
 * `repository` and `branch`: the source, as sourceOf() names it. `credential()`: what Sveltia
 * signed in with. Gives { saved: true }, also where a rule holds the address already, or
 * { refusal }, by its name and values; throws where Forgejo cannot be asked or answers otherwise.
 */
export async function saveRule({ api, repository, branch, credential, address, to, ask = (...args) => globalThis.fetch(...args), pause = (ms) => new Promise((go) => setTimeout(go, ms)) }) {
  const forgejo = async (path, init = {}) => {
    const signedIn = credential();
    if (!signedIn) throw new Error('nobody is signed in');
    return ask(`${api}/repos/${repository}${path}`, { ...init, headers: { ...init.headers, authorization: signedIn }, cache: 'no-store' });
  };
  const made = to === undefined ? { from: address, status: GONE } : { from: address, to, status: REDIRECT };
  for (let tried = 1; ; tried += 1) {
    const answer = await forgejo(contentsPath(REDIRECTS, branch));
    if (!answer.ok && answer.status !== 404) throw Object.assign(new Error(`Forgejo answered ${answer.status} for ${REDIRECTS}`), { status: answer.status });
    const file = answer.ok ? await answer.json() : null;
    let given = { rules: [] };
    if (file !== null) {
      try {
        given = JSON.parse(decodedContent(file.content));
      } catch {
        given = undefined;
      }
    }
    const rules = Array.isArray(given) ? given : Array.isArray(given?.rules) ? given.rules : null;
    if (rules === null) return { refusal: { name: 'notFound.unreadableRules', values: {} } };
    if (rules.some((rule) => holds(rule, address))) return { saved: true };
    const next = [...rules, made];
    const before = new Set(readRules({ rules }).problems.map(said));
    const refused = readRules({ rules: next }).problems.find((problem) => !before.has(said(problem)));
    if (refused) return { refusal: refused.reason };
    const text = `${JSON.stringify(Array.isArray(given) ? next : { ...given, rules: next }, null, 2)}\n`;
    const saved = await forgejo('/contents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        branch,
        message: to === undefined ? `Answer ${address} with 410` : `Redirect ${address} to ${to}`,
        files: [{ operation: file === null ? 'create' : 'update', path: REDIRECTS, content: base64(new TextEncoder().encode(text)), ...(file === null ? {} : { sha: file.sha }) }],
      }),
    });
    if (saved.ok) return { saved: true };
    const again = [409, 422, 423].includes(saved.status) || saved.status >= 500;
    if (!again || tried >= TRIES) throw Object.assign(new Error(`Forgejo answered ${saved.status} to the rule for ${address}`), { status: saved.status });
    await pause(200 * tried + Math.random() * 400);
  }
}
