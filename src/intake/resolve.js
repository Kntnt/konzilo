// What a reference by ID leads to now: the one place that says whether the site shows a
// post, and where. Links, menus and settings all resolve through it, so that none can
// lead elsewhere than the others.

import { say } from './words.js';

// The page a post has now: where it is live this build, or, for a refused post that
// keeps its file, where that file answers, under the title it was published with.
export function pageOf(post, run) {
  const live = run.live?.get(post.key);
  if (live) return post.type.address === null ? null : { address: live.address, title: post.title };
  if (run.refused.has(post.key) && !post.keepsNothing && !post.notFound) {
    const previous = run.ledger.posts[post.key];
    if (previous?.path && previous.address) return { address: previous.address, title: previous.title };
  }
  return null;
}

// What a reference by ID leads to now: { address, title }, or { none: <words> } for a
// target with no page now, or { reason } for what no page can show. `language` is the
// language of what refers; a reference may name another, `<tag>/<id>`. A post is looked
// for in that language, then in each of the site's.
export function leadsTo(run, reference, language) {
  const parts = reference.split('/');
  const id = parts.at(-1);
  const tag = parts.length > 1 ? parts[0] : null;
  const posts = run.postsById.get(id);
  if (posts) {
    const [any] = posts;
    if (any.type.address === null) return { reason: say('refusal.reference-no-address', { title: any.title ?? id, plural: { label: any.type.plural } }) };
    const wanted = tag ?? language?.tag ?? null;
    const own = posts.find((post) => post.tag === wanted);
    const candidates = own ? [own] : tag ? [] : posts;
    for (const post of candidates) {
      const page = pageOf(post, run);
      if (page) return { ...page, otherLanguage: post.tag !== language?.tag ? post : null };
    }
    return { none: (own ?? any).title ?? id };
  }
  const term = run.termsById.get(id);
  if (term) {
    if (term.taxonomy.address === null) return { reason: say('refusal.reference-term', { term: term.label, plural: { label: term.taxonomy.plural } }) };
    const page = run.termPages?.get(term.key);
    return page ? { address: page, title: term.name } : { none: term.label };
  }
  return { none: null };
}

export function linkTarget(run, post, reference, fragment) {
  const target = leadsTo(run, reference, post.language);
  if (target.reason) return { reason: target.reason };
  if (target.none !== undefined) {
    return { text: true, warning: target.none === null ? say('warning.link-gone') : say('warning.link-no-page', { title: target.none }) };
  }
  const explicit = reference.includes('/');
  const translated = explicit && target.otherLanguage && run.postsById.get(reference.split('/').at(-1)).some((one) => one.tag === post.tag && pageOf(one, run));
  return { href: `${target.address}${fragment ? `#${fragment}` : ''}`, warning: translated ? say('warning.link-language') : undefined };
}
