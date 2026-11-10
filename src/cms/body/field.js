// The body field, without Sveltia: a value goes in, and `changed` hears of each real edit.
// Nothing else writes: not opening, focus, a click, or a remount, so a post opened and left
// stays as it was, and an edit undone gives the value's own bytes back.
//
// The way out: if writing a value would change what it means, as Sätteri reads it, the
// field opens it as Markdown and says why. If the reader did not load, nothing can prove a
// rewrite safe, so only a value the editor writes back to the byte opens in the editor.

import { PLACE_EVENT } from '../preview/paths.js';
import { tellPreview } from './tell.js';

const RING_FOR = 1600;

// A frame around `block` for a moment, drawn in `frame`, outside the editor's document.
function ring(frame, block) {
  if (getComputedStyle(frame).position === 'static') frame.style.position = 'relative';
  const outer = frame.getBoundingClientRect();
  const inner = block.getBoundingClientRect();
  const shown = document.createElement('div');
  shown.className = 'konzilo-body-ring';
  Object.assign(shown.style, { left: `${inner.left - outer.left - 6}px`, top: `${inner.top - outer.top - 4}px`, width: `${inner.width + 12}px`, height: `${inner.height + 8}px` });
  frame.append(shown);
  setTimeout(() => shown.remove(), RING_FOR);
}
import { changeBetween, handsFor, loadReader } from './check.js';
import { chooseImage } from './chooser.js';
import { makeEditor } from './crepe.js';
import './field.css';
import { fieldClosed, fieldOpened } from './open-fields.js';
import { elementName, say } from './texts.js';

// A short wait, so that a burst of keys is written once. Blur and Mod-S write at once.
const WRITE_AFTER = 50;
// An owner that never answers must not make the list grow without end.
const UNANSWERED_AT_MOST = 64;

const element = (tag, className, parent) => {
  const made = document.createElement(tag);
  made.className = className;
  parent?.append(made);
  return made;
};

const sameBytes = (one, other) => one.replace(/\r\n?/g, '\n').trimEnd() === other.replace(/\r\n?/g, '\n').trimEnd();

export function mountBodyField(host, { value: given, changed, elements, forms, adminHost, library = null, smallestWidth = null }) {
  const images = library && { choose: () => chooseImage({ library, smallestWidth }), chooseSeveral: () => chooseImage({ library, smallestWidth, several: true }), picture: library.picture };
  const frame = element('div', 'konzilo-body', host);
  const bar = element('div', 'konzilo-body-bar', frame);
  const notes = element('div', 'konzilo-body-notes', bar);
  notes.setAttribute('role', 'status');
  const offNote = element('p', 'konzilo-body-note', notes);
  const wayOutNote = element('p', 'konzilo-body-note', notes);
  offNote.hidden = true;
  wayOutNote.hidden = true;
  const toggle = element('button', 'konzilo-body-toggle', bar);
  toggle.type = 'button';
  const loading = element('p', 'konzilo-body-loading', frame);
  loading.textContent = say('loading');
  const visual = element('div', 'konzilo-body-visual', frame);
  const source = element('textarea', 'konzilo-body-source', frame);
  source.setAttribute('aria-label', say('markdownLabel'));
  source.spellcheck = true;
  visual.hidden = true;
  source.hidden = true;
  toggle.hidden = true;

  let value = given ?? '';
  let mode = 'loading';
  let editor = null;
  let hands;
  let openedValue = null; // What the editor was opened on.
  let baseline = null; // What the editor writes of it, untouched.
  let lastWritten = null;
  let refused = null; // What the editor would have written of a value it did not get to hold.
  let timer = null;
  let generation = 0;
  let gone = false;
  // What the owner has been told and has not answered yet. It answers a write with the value,
  // later than a person's next key can come, so an answer is no news from outside.
  const unanswered = [];

  const tell = (next) => {
    unanswered.push(next);
    if (unanswered.length > UNANSWERED_AT_MOST) unanswered.shift();
    changed(next);
  };

  const closeEditor = () => {
    if (!editor) return;
    clearTimeout(timer);
    const closing = editor;
    editor = null;
    closing.destroy();
    visual.replaceChildren();
  };

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    if (!editor) return;
    const written = editor.write();
    if (written === lastWritten) return;
    lastWritten = written;
    const next = written === baseline ? openedValue : written;
    if (next === value) return;
    value = next;
    tell(next);
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, WRITE_AFTER);
  };

  const showNote = (note, words) => {
    note.textContent = words ?? '';
    note.hidden = !words;
  };

  const showMarkdown = (reason) => {
    mode = 'markdown';
    source.value = value;
    source.hidden = false;
    visual.hidden = true;
    loading.hidden = true;
    toggle.hidden = false;
    toggle.textContent = say('showEditor');
    showNote(wayOutNote, reason);
    frame.dataset.mode = 'markdown';
  };

  const showEditor = () => {
    mode = 'editor';
    visual.hidden = false;
    source.hidden = true;
    loading.hidden = true;
    toggle.hidden = false;
    toggle.textContent = say('showMarkdown');
    showNote(wayOutNote, null);
    frame.dataset.mode = 'editor';
  };

  // Why the editor must not hold this value, or null.
  const reasonAgainst = (written) => {
    if (!hands) return sameBytes(value, written) ? null : say('wayOutOff');
    let change;
    try {
      change = changeBetween(value, written, hands);
    } catch (error) {
      console.warn(`The body field could not compare a value: ${error.message}`);
      return say('wayOutLost');
    }
    if (change === null) return null;
    return change.path ? say('wayOutBlock', { element: elementName(change.element), path: change.path }) : say('wayOutLost');
  };

  const openEditor = async () => {
    generation += 1;
    const mine = generation;
    closeEditor();
    const opening = value;
    let made;
    try {
      const reader = await loadReader();
      hands = reader ? handsFor(reader, { elements, forms, adminHost }) : null;
      showNote(offNote, reader ? null : say('checkOff'));
      made = await makeEditor({ root: visual, value: opening, elements, changed: () => schedule(), images });
    } catch (error) {
      console.warn(`The body field could not read a value: ${error.message}`);
      if (mine === generation && !gone) {
        visual.replaceChildren();
        showMarkdown(say('wayOutRead'));
      }
      return;
    }
    if (mine !== generation || gone) {
      made.destroy();
      return;
    }
    const written = made.write();
    const reason = reasonAgainst(written);
    if (reason !== null) {
      refused = written;
      made.destroy();
      visual.replaceChildren();
      showMarkdown(reason);
      return;
    }
    editor = made;
    openedValue = opening;
    baseline = written;
    lastWritten = written;
    showEditor();
  };

  const toMarkdown = () => {
    flush();
    showMarkdown(null);
    source.focus();
  };

  const toEditor = () => {
    // The editor kept its undo while the Markdown was shown, if the Markdown did not change.
    if (editor && value === (lastWritten === baseline ? openedValue : lastWritten)) showEditor();
    else {
      mode = 'loading';
      void openEditor();
    }
  };

  toggle.addEventListener('click', () => (mode === 'editor' ? toMarkdown() : toEditor()));
  source.addEventListener('input', () => {
    if (source.value === value) return;
    value = source.value;
    tell(value);
  });
  visual.addEventListener('focusout', () => {
    if (timer !== null) flush();
  });

  const field = {
    flush,
    // A value from outside, a revert or a restored backup, opens anew and writes nothing.
    setValue(next) {
      const newer = next ?? '';
      const answered = unanswered.indexOf(newer);
      if (answered !== -1) {
        unanswered.splice(0, answered + 1);
        return;
      }
      if (timer !== null) flush();
      if (newer === value) return;
      unanswered.length = 0;
      value = newer;
      if (mode === 'markdown') source.value = value;
      else void openEditor();
    },
    get value() {
      return value;
    },
    get mode() {
      return mode;
    },
    // What the editor writes of the document, or would have; for a test of the writer.
    written: () => editor?.write() ?? refused,
    get view() {
      return editor?.view ?? null;
    },
    command: (name) => editor?.run(name),
    goTo: (place) => mode === 'editor' && editor !== null && editor.goTo(place),
    frame,
    destroy() {
      flush();
      gone = true;
      globalThis.removeEventListener(PLACE_EVENT, placed);
      visual.removeEventListener('click', told);
      visual.removeEventListener('keyup', told);
      fieldClosed(field);
      closeEditor();
      frame.remove();
    },
  };
  // A click on the preview's page, for whichever field holds that block: on a site in several
  // languages, the one whose text it is. The block is framed for a moment, outside the editor's
  // own document, so that the editor sees no change.
  const placed = ({ detail }) => {
    if (!frame.isConnected || !field.goTo(detail)) return;
    const view = editor?.view;
    const { node } = view?.domAtPos(view.state.selection.from) ?? {};
    const block = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('li, p, h2, h3, h4, h5, h6, blockquote, pre, table, [data-type], .konzilo-kept') ?? null;
    if (block && frame.contains(block)) ring(frame, block);
  };
  globalThis.addEventListener(PLACE_EVENT, placed);
  // A click in the field, or the arrows moving to another block, shows that block in the preview.
  const told = (event) => {
    const view = editor?.view;
    if (mode === 'editor' && view?.dom.contains(event.target)) tellPreview(view, event);
  };
  visual.addEventListener('click', told);
  visual.addEventListener('keyup', told);
  fieldOpened(field);
  field.ready = openEditor();
  return field;
}
