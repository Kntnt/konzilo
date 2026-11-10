// The other way from place.js: a click in the body field, or the arrows moving the cursor to
// another block, shows that block in the preview, by its path as the page marks it, its place
// among the body's blocks and, in a list, its item, with its text, so that the page finds it
// though the path has moved a moment ahead of it (block-marks.js).

import { SHOW_EVENT } from '../preview/paths.js';

const KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
const TEXT = 300;
const told = new WeakMap();

const isList = (node) => node.firstChild?.type.name === 'list_item';

// The block's path and text at a position in the document.
function blockAt(doc, at) {
  if (doc.childCount === 0) return null;
  const $at = doc.resolve(Math.min(Math.max(at, 0), doc.content.size));
  const index = Math.min($at.index(0), doc.childCount - 1);
  const block = doc.child(index);
  if ($at.depth >= 1 && isList(block)) {
    const item = Math.min($at.index(1), block.childCount - 1);
    return { path: `${index}.${item}`, text: block.child(item).textContent };
  }
  return { path: String(index), text: block.textContent };
}

// `view`: the field's ProseMirror view. `event`: a click or a key in the field. A key tells only
// when the cursor has gone to another block; a click always does, so that a block scrolled away
// in the preview comes back.
export function tellPreview(view, event) {
  let at = view.state.selection.from;
  if (event.type === 'click') {
    // Where the click was, in a kept block too, which takes no cursor.
    const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (found) at = found.inside >= 0 ? found.inside : found.pos;
  } else if (!KEYS.has(event.key)) return;
  const block = blockAt(view.state.doc, at);
  if (!block) return;
  if (event.type !== 'click' && told.get(view) === block.path) return;
  told.set(view, block.path);
  globalThis.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: { path: block.path, text: block.text.slice(0, TEXT) } }));
}
