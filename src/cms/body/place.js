// Where a click in the preview's page puts the cursor in the field: `block`, the body's block by
// its place, `count`, how many characters of its text, spaces aside, come before the click, and
// `text`, the start of that text, spaces aside. The page may be a moment behind what is typed, so
// the block is taken where its text begins as the page's does, the one nearest its place when it
// has moved. A block with no text of its own, an embed or a kept block, goes by its place alone.
// Gives a selection, or null where the block is not to be found.

import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';

const solid = (words) => words.replace(/\s+/g, '');
const ENOUGH = 40;

export function selectionAt(doc, { block, count, text }) {
  const start = solid(text).slice(0, ENOUGH);
  const fits = (node) => node.isAtom || solid(node.textContent).startsWith(start);
  let index = block < doc.childCount && fits(doc.child(block)) ? block : -1;
  if (index === -1) {
    doc.forEach((node, _, at) => {
      if (!node.isAtom && fits(node) && (index === -1 || Math.abs(at - block) < Math.abs(index - block))) index = at;
    });
  }
  if (index === -1) return null;
  let pos = 0;
  for (let at = 0; at < index; at += 1) pos += doc.child(at).nodeSize;
  const node = doc.child(index);
  if (node.isAtom || node.textContent.trim() === '') return NodeSelection.isSelectable(node) ? NodeSelection.create(doc, pos) : TextSelection.near(doc.resolve(pos));
  let seen = 0;
  let found = null;
  let last = null;
  node.descendants((child, offset) => {
    if (found !== null) return false;
    if (!child.isText) return true;
    const from = pos + 1 + offset;
    for (let at = 0; at < child.text.length; at += 1) {
      if (/\s/.test(child.text[at])) continue;
      if (seen === count) {
        found = from + at;
        return false;
      }
      seen += 1;
    }
    last = from + child.text.length;
    return false;
  });
  return TextSelection.create(doc, found ?? last);
}
