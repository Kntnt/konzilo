// What publishing looks like to an editor (ADR 0031): a field in a post's form, and a page that
// lists every post. Both are React, since that is what Sveltia takes, with their styles on the
// elements, and both write nothing: the field never calls its owner's `onChange`, so it leaves
// nothing in a post's file.

import { say } from '../body/texts.js';
import { signedInCredential } from '../credential.js';
import { fileRefusalShown, wordsShown } from '../refusals.js';
import { filesOf, languageOf, readStatus, statusWords, watchedStatus } from './status.js';

const TONES = { good: '#1a7f37', busy: '#9a6700', bad: '#cf222e', quiet: '#6e7781' };
const LINE = { display: 'flex', gap: 8, alignItems: 'baseline', margin: '4px 0', font: '14px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere' };
const DOT = (tone) => ({ flex: 'none', width: 10, height: 10, borderRadius: '50%', background: TONES[tone] });
const LIST = { margin: '4px 0 8px 18px', padding: 0, font: '14px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere' };
const CELL = { padding: '8px 12px', verticalAlign: 'top', textAlign: 'start', font: '14px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere' };
const ORDER = { failed: 0, 'being-published': 1, scheduled: 2, live: 3, draft: 4 };

const react = () => globalThis.__SVELTIA_CMS_REACT__;

function useStatus(credential) {
  const { useEffect, useState } = react();
  const [status, setStatus] = useState(undefined);
  useEffect(() => {
    const watch = watchedStatus({ read: () => readStatus({ credential }), changed: setStatus });
    return () => watch.close();
  }, []);
  return status;
}

function PostStatus({ post, site, withLanguage }) {
  const { createElement: h } = react();
  const { tone, words, details } = statusWords(post);
  const language = withLanguage ? languageOf(post) : null;
  return h('div', { role: 'status' },
    h('p', { style: LINE },
      h('span', { 'aria-hidden': true, style: DOT(tone) }),
      h('span', null, language ? `${language}: ${words}` : words, post.status === 'live' && post.address ? ' ' : null,
        post.status === 'live' && post.address ? h('a', { href: new URL(post.address, site).href, target: '_blank', rel: 'noopener' }, say('publishing.showPage')) : null)),
    details.length > 0 ? h('ul', { style: LIST }, details.map((detail) => h('li', { key: detail }, detail))) : null);
}

export function publishingField({ site, credential = signedInCredential }) {
  return function KonziloPublishing({ entry }) {
    const { createElement: h } = react();
    const status = useStatus(credential);
    const id = entry?.get('slug');
    if (!id) return h('p', { style: LINE }, say('publishing.notSaved'));
    if (status === undefined) return null;
    if (status === null) return h('p', { style: LINE }, say('publishing.unknown'));
    const posts = filesOf(status.posts, entry.get('collection'), id);
    // A save the service has not seen yet, of a post it has never heard of.
    if (posts.length === 0) return h(PostStatus, { post: { status: 'being-published', stillShown: false }, site });
    return h('div', null, posts.map((post) => h(PostStatus, { key: post.file, post, site, withLanguage: posts.length > 1 })));
  };
}

export function publishingPage({ site, collectionOf, credential = signedInCredential }) {
  return function KonziloPublishingPage() {
    const { createElement: h } = react();
    const status = useStatus(credential);
    if (status === undefined) return null;
    if (status === null) return h('p', { style: { ...LINE, padding: 16 } }, say('publishing.unknown'));
    const posts = [...status.posts].sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.title ?? a.file).localeCompare(String(b.title ?? b.file)));
    const others = [...status.others.refusals, ...status.others.warnings];
    return h('div', { style: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box' } },
      status.reason ? h('p', { role: 'alert', style: { ...LINE, color: TONES.bad } }, wordsShown(status.reason)) : null,
      others.length > 0 ? h('section', null,
        h('h3', { style: { margin: '12px 0 4px', font: '600 15px/1.3 system-ui, sans-serif' } }, say('publishing.others')),
        h('ul', { style: LIST }, others.map((refusal) => h('li', { key: refusal.message ?? `${refusal.file}:${refusal.reason}` }, fileRefusalShown(refusal))))) : null,
      h('table', { style: { borderCollapse: 'collapse', width: '100%' } },
        h('thead', null, h('tr', null, h('th', { style: CELL }, say('publishing.title')), h('th', { style: CELL }, say('publishing.status')))),
        h('tbody', null, posts.map((post) => {
          const collection = post.file.split('/')[0];
          const name = post.title ?? post.file;
          const entry = `#/collections/${collectionOf(collection)}/entries/${post.file.split('/').at(-1).replace(/\.md$/, '')}`;
          return h('tr', { key: post.file, style: { borderTop: '1px solid rgba(128, 128, 128, 0.3)' } },
            h('td', { style: CELL }, h('a', { href: entry }, name)),
            h('td', { style: CELL }, h(PostStatus, { post, site, withLanguage: languageOf(post) !== null })));
        }))));
  };
}
