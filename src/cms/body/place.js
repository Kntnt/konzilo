// Where a click in the preview's page puts the cursor in the field: `block`, the body's block by
// its place, `path`, its place within it, `2.1` for a list's second item, `count`, how many
// characters of its text, spaces aside, come before the click, and `text`, the start of that
// text, spaces aside. The page may be a moment behind what is typed, so
// the block is taken where its text begins as the page's does, the one nearest its place when it
// has moved. A block with no text of its own, an embed or a kept block, goes by its place alone.
// Gives a selection, or null where the block is not to be found.

import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';

const solid = (words) => words.replace(/\s+/g, '');
const ENOUGH = 40;

// The node at the steps below a top-level block, as far as the field holds them, and where it
// starts; a block with no children of its own, or a kept block, is itself.
function below(node, pos, steps) {
  let at = { node, pos };
  for (const step of steps) {
    if (at.node.isTextblock || at.node.isAtom || step >= at.node.childCount) break;
    let inner = at.pos + 1;
    for (let index = 0; index < step; index += 1) inner += at.node.child(index).nodeSize;
    at = { node: at.node.child(step), pos: inner };
  }
  return at;
}

export function selectionAt(doc, { block, path, count, text }) {
  const steps = String(path ?? block).split('.').slice(1).map(Number);
  const start = solid(text).slice(0, ENOUGH);
  const fits = (top) => {
    const { node } = below(top, 0, steps);
    return node.isAtom || solid(node.textContent).startsWith(start);
  };
  let index = block < doc.childCount && fits(doc.child(block)) ? block : -1;
  if (index === -1) {
    doc.forEach((node, _, at) => {
      if (!node.isAtom && fits(node) && (index === -1 || Math.abs(at - block) < Math.abs(index - block))) index = at;
    });
  }
  if (index === -1) return null;
  let top = 0;
  for (let at = 0; at < index; at += 1) top += doc.child(at).nodeSize;
  const { node, pos } = below(doc.child(index), top, steps);
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
