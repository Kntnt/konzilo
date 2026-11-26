// What the editor's Admin pages share: what the service answers a page, asked as the page is first
// shown; what the page shows while that answer is none to show, before the service has told it,
// where the service cannot tell, and to one who is no Admin; and the styles of its text, a line of
// it and a table's cell. It is React, since that is what Sveltia takes, with its styles on the
// elements.

import { say } from './interface-language.js';

export const TEXT = { font: '14px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere' };
export const LINE = { ...TEXT, margin: '4px 0 12px', maxWidth: '60em' };
export const CELL = { ...TEXT, padding: '4px 12px 4px 0', textAlign: 'start', verticalAlign: 'top' };
const FRAME = { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box' };

const react = () => globalThis.__SVELTIA_CMS_REACT__;

// What the service answers a page, by `read()`, asked as the page is first shown and again
// whenever `deps` change, each answer kept until the next comes: undefined until the first,
// else as `read()` gives it, which is null where the service cannot tell. Gives [answer, setAnswer],
// for what the page does to change it.
export function useAnswer(read, deps = []) {
  const { useEffect, useState } = react();
  const [answer, setAnswer] = useState(undefined);
  useEffect(() => {
    let gone = false;
    read().then((given) => {
      if (!gone) setAnswer(given);
    });
    return () => {
      gone = true;
    };
  }, deps);
  return [answer, setAnswer];
}

// The page, around `children`, with `className` where it has one.
export const pageOf = (children, className = undefined) => react().createElement('div', { className, style: FRAME }, ...children);

// What a page shows in place of what it holds while `answer` is none to show: nothing before the
// service has told it; where it cannot tell, the words named `unknown`, unless that is null, which
// leaves it to the page; and to one who is no Admin, the words named `adminOnly`. Undefined for an
// answer to show.
export function heldBack(answer, { unknown = null, adminOnly, className = undefined }) {
  const { createElement: h } = react();
  if (answer === undefined) return null;
  if (answer === null && unknown !== null) return pageOf([h('p', { role: 'alert', style: LINE }, say(unknown))], className);
  if (answer?.adminOnly) return pageOf([h('p', { style: LINE }, say(adminOnly))], className);
  return undefined;
}
