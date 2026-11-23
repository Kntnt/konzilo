// The read-only state of the core's own fields (ADR 0073). Sveltia draws its own fields read-only
// once the form is, but the core's fields are its own: the body, the image, the authors, the
// article parts and the settings. In a read-only form nothing in them changes, while what they
// hold can still be read, selected and copied, by the keyboard and a screen reader too: keys that
// would change something, typing, pasting, cutting, dropping and dragging go nowhere, the core's
// buttons do nothing, and each field that can be written in says it is read-only.

// Keys that move, select, copy or leave, and so change nothing.
const MOVING = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'ContextMenu']);
const COPYING = new Set(['c', 'a', 'f', 'g']);

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const CORE_FIELD = '[data-field-type^="konzilo-"]';
const PRESSABLE = 'button, [role="button"], [role="menuitem"], [role="option"], input[type="checkbox"], input[type="radio"], summary, [draggable="true"]';

// Whether an event in a read-only form would change it, and so is held back.
export function changes(event) {
  const target = typeof event.target?.closest === 'function' ? event.target : null;
  if (!target?.closest('[data-mode="edit"]')) return false;
  const inCoreField = target.closest(CORE_FIELD) !== null;
  switch (event.type) {
    case 'beforeinput':
    case 'paste':
    case 'cut':
    case 'drop':
      return true;
    case 'dragstart':
      return inCoreField;
    case 'keydown': {
      if (MOVING.has(event.key) || /^F\d+$/.test(event.key)) return false;
      if ((event.ctrlKey || event.metaKey) && COPYING.has(event.key.toLowerCase()) && !event.altKey) return false;
      if (target.closest(EDITABLE)) return true;
      return inCoreField && target.closest(PRESSABLE) !== null;
    }
    case 'click':
    case 'pointerdown':
    case 'mousedown':
      return inCoreField && target.closest(PRESSABLE) !== null;
    default:
      return false;
  }
}

const EVENTS = ['beforeinput', 'paste', 'cut', 'drop', 'dragstart', 'keydown', 'click', 'pointerdown', 'mousedown'];

// Holds back, in `root`'s document, what would change a read-only form, while `readOnly()`, and
// marks the core's fields read-only as `follow` is told the form turns read-only or back.
export function guardReadOnly(root, { readOnly, follow }) {
  const held = (event) => {
    if (!readOnly() || !changes(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of EVENTS) root.addEventListener(type, held, { capture: true });

  // A screen reader says that a field is read-only, by aria-readonly, on each field that can be
  // written in, including those drawn while the form stays read-only.
  const marked = new Set();
  const mark = () => {
    for (const element of root.querySelectorAll(`[data-mode="edit"] :is(${EDITABLE})`)) {
      if (marked.has(element) || element.getAttribute('aria-readonly') === 'true') continue;
      element.setAttribute('aria-readonly', 'true');
      marked.add(element);
    }
  };
  const unmark = () => {
    for (const element of marked) element.removeAttribute('aria-readonly');
    marked.clear();
  };
  const watching = new (root.defaultView ?? globalThis).MutationObserver(() => mark());
  follow((now) => {
    if (now) {
      mark();
      watching.observe(root.documentElement ?? root, { childList: true, subtree: true });
    } else {
      watching.disconnect();
      unmark();
    }
  });
}
