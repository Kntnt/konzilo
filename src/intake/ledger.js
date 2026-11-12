// The ledger, `.post-ids.json` in the content repository, which only the intake writes.
// Per post, by its ID, or `<tag>/<ID>` on a site in several languages: the file it has
// now and the paths it has had; the address the current release shows it at, which stays
// while it is off the site, and those it had while live; its title as published; the
// source file's hash and the published version's; when the intake first took it and when
// its published version last changed; and what its file names, since a refused post's
// kept file holds on to them. Beside the posts: the moment each scheduled post was seen
// waiting for, while it is still scheduled for it; the old addresses of terms' pages, the
// source hash of each file of an Admin's that was accepted, what the settings last
// chose and the masters they last named, since a refused settings file's kept file holds
// on to them, and the consent revision with the day it last changed.

import { isObject } from '../checks.js';
import { keyOf } from '../format/redirects.js';

export const emptyLedger = () => ({ posts: {}, awaited: {}, terms: {}, files: {}, chosen: { legalPages: [], notFound: null, startPage: null }, settingsMedia: [], consent: null });

// A ledger read from a file: only the shape the intake writes is believed. A file written
// by another hand is not assumed to be right, and counts for nothing.
export function normalLedger(given) {
  const empty = emptyLedger();
  if (!isObject(given) || !isObject(given.posts)) return empty;
  return {
    posts: given.posts,
    awaited: isObject(given.awaited) ? given.awaited : empty.awaited,
    terms: isObject(given.terms) ? given.terms : empty.terms,
    files: isObject(given.files) ? given.files : empty.files,
    chosen: isObject(given.chosen) ? { legalPages: given.chosen.legalPages ?? [], notFound: given.chosen.notFound ?? null, startPage: given.chosen.startPage ?? null } : empty.chosen,
    settingsMedia: Array.isArray(given.settingsMedia) ? given.settingsMedia : empty.settingsMedia,
    consent: isObject(given.consent) ? given.consent : null,
  };
}

const sortedKeys = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const onePerKey = (list) => [...new Set(list)];

function namesOf(written) {
  const names = {};
  const media = [...written.masters.keys()].map((path) => path.slice('media/'.length)).sort();
  if (media.length > 0) names.media = media;
  if (written.termPaths.length > 0) names.terms = written.termPaths;
  if ((written.embeds ?? []).length > 0) names.embeds = [...written.embeds].sort();
  return names;
}

// The ledger after this build, from the run's posts.
export function nextLedger(run, settings) {
  const { ledger, source } = run;
  const posts = { ...ledger.posts };
  // A post not in source has left the site, and its entry stays, so that its addresses
  // are known if it comes back.
  for (const [key, entry] of Object.entries(posts)) {
    if (!run.posts.has(key)) posts[key] = { ...entry, path: null, names: {} };
  }
  for (const post of source.posts) {
    const previous = ledger.posts[post.key];
    if (run.refused.has(post.key)) {
      posts[post.key] = previous ?? blank(post, run);
      continue;
    }
    if (post.written) {
      const notFound = Boolean(post.written.notFound);
      const address = notFound ? previous?.address ?? null : post.place.address;
      const addresses = notFound || address === null ? previous?.addresses ?? [] : onePerKey([...(previous?.addresses ?? []), address]);
      const folder = post.tag ? `${post.tag}/` : '';
      const termPaths = post.written.terms.map((key) => run.terms.get(key)).map((term) => `${term.taxonomy.collection}/${folder}${term.slug}.json`).sort();
      posts[post.key] = {
        path: post.written.path,
        paths: onePerKey([...(previous?.paths ?? []), post.written.path]),
        address,
        addresses,
        title: post.title,
        source: post.hash,
        published: post.written.published,
        taken: post.written.taken,
        modified: post.written.modified,
        names: namesOf({ ...post.written, termPaths }),
      };
      continue;
    }
    if (previous) posts[post.key] = { ...previous, path: null, names: {} };
  }
  // An old address gives way: a post that goes live at it takes it, for good.
  const liveAt = new Map();
  for (const post of source.posts) if (post.written && !post.written.notFound && post.place.address) liveAt.set(keyOf(post.place.address), post.key);
  for (const [key, entry] of Object.entries(posts)) {
    const addresses = (entry.addresses ?? []).filter((address) => {
      const holder = liveAt.get(keyOf(address));
      return holder === undefined || holder === key;
    });
    posts[key] = { ...entry, addresses };
  }
  const terms = { ...ledger.terms };
  for (const [key, page] of run.termPages ?? []) {
    const term = run.terms.get(key);
    const previous = terms[term.id];
    terms[term.id] = { address: page, addresses: onePerKey([...(previous?.addresses ?? []), page]) };
  }
  const files = { ...ledger.files };
  for (const [path, hash] of source.hashes) {
    const held = run.gated.has(path) || refusedFile(run, path);
    if (!held) files[path] = hash;
  }
  const awaited = Object.fromEntries(source.posts.filter((post) => post.awaited).map((post) => [post.key, post.awaited]));
  return {
    posts: sortedKeys(posts),
    awaited: sortedKeys(awaited),
    terms: sortedKeys(terms),
    files: sortedKeys(files),
    chosen: settings.refused ? ledger.chosen : run.chosen,
    settingsMedia: settings.refused ? ledger.settingsMedia : [...settings.masters.keys()].sort(),
    consent: run.consentRecord ?? ledger.consent,
  };
}

const refusedFile = (run, path) => run.refusals.some((refusal) => refusal.file === path);

const blank = (post, run) => ({
  path: null,
  paths: [],
  address: null,
  addresses: [],
  title: post.title ?? post.id,
  source: null,
  published: null,
  taken: run.nowText,
  modified: null,
  names: {},
});

// The ledger's file. A start page is named among what the settings chose only where one is,
// so that a site that chooses none keeps the file it had.
export const ledgerFile = (ledger) => {
  const { startPage = null, ...chosen } = ledger.chosen ?? {};
  return `${JSON.stringify({ ...ledger, chosen: startPage === null ? chosen : { ...chosen, startPage } }, null, 2)}\n`;
};
