// The *Policy violations* page (ADR 0051): what the site's Content Security Policy blocked on its
// pages, as visitors' browsers reported it, counted by page, directive and what was blocked, with
// when each was last seen, the most recent first, and past the first 1,000 one line for the rest.
// An Admin alone sees it. It is React, since that is what Sveltia takes, with its styles on the
// elements.

import { signedInCredential } from '../credential.js';
import { languageTag, say } from '../interface-language.js';
import { momentShown } from '../submissions/client.js';
import { blockedShown, readViolations } from './client.js';

const TEXT = { font: '14px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere' };
const LINE = { ...TEXT, margin: '4px 0 12px', maxWidth: '60em' };
const TABLE = { ...TEXT, borderCollapse: 'collapse', width: '100%' };
const CAPTION = { fontWeight: 600, textAlign: 'start', marginBottom: 8 };
const CELL = { padding: '8px 12px 8px 0', borderBottom: '1px solid rgba(128, 128, 128, 0.3)', textAlign: 'start', verticalAlign: 'top' };
const HEAD = { ...CELL, fontWeight: 600 };
const ROW_HEAD = { ...CELL, fontWeight: 'normal' };
const NUMBER = { ...CELL, textAlign: 'end', fontVariantNumeric: 'tabular-nums' };

const react = () => globalThis.__SVELTIA_CMS_REACT__;

const numberShown = (number) => new Intl.NumberFormat(languageTag()).format(number);

// A path as a person reads it, its escapes undone where they can be.
const pathShown = (path) => {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
};

function Counts({ counts }) {
  const { createElement: h } = react();
  const { days, most, violations, rest } = counts;
  if (violations.length === 0 && rest === null) return h('p', { role: 'status', style: LINE }, say('violations.none', { days: numberShown(days) }));
  return h('table', { style: TABLE },
    h('caption', { style: CAPTION }, say('violations.caption')),
    h('thead', null, h('tr', null,
      h('th', { scope: 'col', style: HEAD }, say('violations.pageHeading')),
      h('th', { scope: 'col', style: HEAD }, say('violations.directive')),
      h('th', { scope: 'col', style: HEAD }, say('violations.blocked')),
      h('th', { scope: 'col', style: { ...HEAD, textAlign: 'end' } }, say('violations.count')),
      h('th', { scope: 'col', style: HEAD }, say('violations.lastSeen')))),
    h('tbody', null, violations.map(({ page, directive, blocked, count, lastSeen }) => h('tr', { key: `${page}\n${directive}\n${blocked}` },
      h('th', { scope: 'row', style: ROW_HEAD }, pathShown(page)),
      h('td', { style: CELL }, h('code', null, directive)),
      h('td', { style: CELL }, blockedShown(blocked)),
      h('td', { style: NUMBER }, numberShown(count)),
      h('td', { style: CELL }, momentShown(lastSeen))))),
    rest === null ? null : h('tfoot', null, h('tr', null,
      h('th', { scope: 'row', colSpan: 3, style: ROW_HEAD }, say('violations.rest', { most: numberShown(most) })),
      h('td', { style: NUMBER }, numberShown(rest.count)),
      h('td', { style: CELL }, momentShown(rest.lastSeen)))));
}

export function violationsPage({ credential = signedInCredential } = {}) {
  return function KonziloViolationsPage() {
    const { createElement: h, useEffect, useState } = react();
    const [answer, setAnswer] = useState(undefined);
    useEffect(() => {
      let gone = false;
      readViolations({ credential }).then((given) => {
        if (!gone) setAnswer(given);
      });
      return () => {
        gone = true;
      };
    }, []);
    const page = (...children) => h('div', { className: 'konzilo-violations', style: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box' } }, ...children);
    if (answer === undefined) return null;
    if (answer === null) return page(h('p', { role: 'alert', style: LINE }, say('violations.unknown')));
    if (answer.adminOnly) return page(h('p', { style: LINE }, say('violations.adminOnly')));
    return page(
      h('p', { style: LINE }, say('violations.intro', { days: numberShown(answer.counts.days) })),
      h(Counts, { counts: answer.counts }));
  };
}
