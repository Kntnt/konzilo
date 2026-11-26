// The address a post's form shows, the link of its slug and its own address in the canonical
// address's field, from the values the form holds as they stand, saved or not: its slug, its
// date and the term of each field its type's address holds, so that it follows a changed date
// or term at once. The form holds a term by its ID, so the term's slug, and its parents' in a
// hierarchical taxonomy, are read from the source repository's term files, through Forgejo with
// the credential of whoever is signed in, as a field of Sveltia's cannot read another
// collection's entries. The address itself is filled where every address is
// (format/addresses.js).

import { filledAddress, termChain, termPath, termSlug } from '../../format/addresses.js';
import { momentOf } from '../../format/moment.js';
import { sourceReader } from '../source.js';

// How long a term's file, once read, is taken as it is, so that a term renamed meanwhile shows.
const FRESH = 30_000;

// The source as sourceOf() names it, and `credential()`, the signed-in editor's. Gives
// pathOf(collection, id, folder), the path of the term by its ID in a taxonomy's collection,
// its parents' slugs from the top and its own, each as the intake takes it (termSlug()), the
// files in the language folder `folder` on a site in several languages, the main language's,
// which decides a term's slug; null where a file is missing or the parents go round.
export function termPathReader({ api, repository, branch, credential, get, now = () => Date.now() }) {
  const source = sourceReader({ api, repository, branch, credential, get });
  const known = new Map();
  const read = (path) => {
    const held = known.get(path);
    if (held && now() - held.at < FRESH) return held.value;
    const value = source.text(path).then((text) => (text === null ? null : JSON.parse(text))).catch(() => null);
    known.set(path, { at: now(), value });
    return value;
  };
  return async (collection, id, folder = null) => {
    if (!api || !credential() || typeof id !== 'string' || id === '') return null;
    return termPath(await termChain(id, async (next) => {
      const term = await read(`${collection}/${folder ? `${folder}/` : ''}${next}.json`);
      const slug = term === null ? null : termSlug(term);
      return typeof slug === 'string' && slug !== '' ? { slug, parent: term.parent } : null;
    }));
  };
}

// A post's page on the public site at `site`, from its type's address `template`, with any
// language's prefix (addressTemplate()), and the form's values: `data`, flat, its slug, date
// and parent among them; `terms`, the path of each term its address holds, by its field's name.
// A post without a date of its own is where the intake puts it from now. Empty while the form
// lacks a value the address holds, and for a post below another, whose parents' slugs the form
// does not hold.
export function formAddress(site, template, data, terms = {}, now = new Date()) {
  if (typeof template !== 'string' || !data?.slug || data.parent) return '';
  const date = momentOf(data.date ?? '') ?? momentOf(now);
  const address = filledAddress(template, { name: data.slug, date, terms });
  return address === null ? '' : new URL(address, site).href;
}
