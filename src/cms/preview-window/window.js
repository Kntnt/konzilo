// The preview in a window of its own, which can go to another screen, so that the form takes the
// editor's whole width. The window is an empty page from the editor's own origin, with the
// preview's page in a frame in it, as in the pane: the same gate, the same guard against the page
// going elsewhere, and the page and the editor speak as before. A window opened straight at the
// preview's pages would lose touch with the editor, since those pages send
// Cross-Origin-Opener-Policy.
//
// There is one window for the whole editor. The choice in the editor's menu opens it, since a
// browser opens a window only on a click, and the preview of an open entry draws in it. The choice
// is kept among Sveltia's own settings, as previewWindow, and the menu says so with the event
// konzilo-view when it changes (patches.json).

import { say } from '../interface-language.js';

const NAME = 'konzilo-preview';
const SIZE = 'popup,width=1280,height=900';
const MARK = 'konzilo-preview-window';
// How often the window is looked at. Once it is closed, or loaded again, the pane comes back.
const LOOK_EVERY = 1000;
// How long the window says that the preview is starting, before it says how to get one.
const STARTING_FOR = 3000;
const QUIET = { margin: 0, padding: '16px', font: '15px/1.4 system-ui, sans-serif', color: '#1c1c1c' };

let popup = null;
let parts = null;
let shownAddress = null;
let drawing = false;
let wasOpen = false;
let looking = null;
const listeners = new Set();
const watchers = new Set();

const wanted = () => globalThis.konziloEditorView?.current?.previewWindow === true;

const isOpen = () => {
  try {
    return parts !== null && !popup.closed && popup.document.getElementById(MARK) === parts.root;
  } catch {
    return false;
  }
};

const notify = () => {
  wasOpen = isOpen();
  for (const watcher of [...watchers]) watcher();
};

const look = () => {
  if (isOpen() !== wasOpen) notify();
  if (!wasOpen) {
    clearInterval(looking);
    looking = null;
  }
};

const styled = (element, style) => {
  for (const [name, value] of Object.entries(style)) element.style[name] = typeof value === 'number' ? `${value}px` : value;
  return element;
};

// The page in the frame speaks to what stands around it, which is the window.
const forward = (event) => {
  for (const heard of [...listeners]) heard(event);
};

const setUp = () => {
  const page = popup.document;
  styled(page.body, { margin: 0 });
  const root = styled(page.createElement('div'), { display: 'flex', flexDirection: 'column', height: '100vh' });
  root.id = MARK;
  const notes = page.createElement('div');
  // White behind the page, so that a page being drawn again never shows a dark frame.
  const holder = styled(page.createElement('div'), { position: 'relative', flex: '1 1 auto', overflow: 'hidden', minHeight: 0, background: '#fff' });
  const frame = styled(page.createElement('iframe'), { display: 'none', border: 0, width: '100%', height: '100%', background: '#fff' });
  const passing = styled(page.createElement('p'), { display: 'none' });
  passing.setAttribute('role', 'status');
  holder.append(frame, passing);
  root.append(notes, holder);
  page.body.replaceChildren(root);
  popup.addEventListener('message', forward);
  parts = { root, notes, frame, passing };
  shownAddress = null;
};

const noteElement = (page, { role, look: style, text, items }) => {
  const note = styled(page.createElement(items ? 'div' : 'p'), style);
  note.setAttribute('role', role);
  note.append(text);
  if (items) {
    const list = styled(page.createElement('ul'), { margin: '4px 0 0', paddingInlineStart: '20px' });
    list.append(...items.map(({ text: item }) => Object.assign(page.createElement('li'), { textContent: item })));
    note.append(list);
  }
  return note;
};

// What a preview shows: the page at `address` (null: no page), the notes above it, and
// `passing`, { text, look }, over it for a moment.
const show = ({ origin, address, notes, passing = null, sandbox, frameTitle, title }) => {
  if (!isOpen()) return;
  drawing = true;
  const page = popup.document;
  page.title = title;
  parts.notes.replaceChildren(...notes.map((note) => noteElement(page, note)));
  const { frame } = parts;
  if (address === null) {
    frame.style.display = 'none';
  } else {
    frame.title = frameTitle;
    frame.setAttribute('sandbox', sandbox);
    const src = `${origin}${address}`;
    if (src !== shownAddress) {
      frame.src = src;
      shownAddress = src;
    }
    frame.style.display = 'block';
  }
  parts.passing.textContent = passing?.text ?? '';
  styled(parts.passing, passing ? { ...passing.look, display: 'block' } : { display: 'none' });
};

// No entry to show: the window stays, with a sentence on why it is empty.
const idle = (text = say('preview.windowIdle')) => {
  if (!isOpen()) return;
  show({ address: null, notes: [{ role: 'status', look: QUIET, text }], title: say('preview.windowName') });
  drawing = false;
};

const open = () => {
  if (isOpen()) {
    popup.focus();
    return true;
  }
  const opened = globalThis.open('', NAME, SIZE);
  if (!opened) return false;
  popup = opened;
  setUp();
  idle(say('preview.starting'));
  setTimeout(() => {
    if (!drawing) idle();
  }, STARTING_FOR);
  looking ??= setInterval(look, LOOK_EVERY);
  notify();
  return true;
};

const close = () => {
  try {
    if (popup !== null && !popup.closed) popup.close();
  } catch {
    // A window that cannot be closed from here may stand.
  }
  popup = null;
  parts = null;
  shownAddress = null;
  notify();
};

globalThis.addEventListener?.('konzilo-view', () => {
  if (wanted()) open();
  else close();
  notify();
});

// When the editor loads again, or closes, the window stays where it is, and can be taken up again.
globalThis.addEventListener?.('pagehide', () => idle(say('preview.windowGone')));

export const previewWindow = {
  wanted,
  isOpen,
  open,
  show,
  idle,
  frame: () => (isOpen() ? parts.frame : null),
  heard(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  watch(watcher) {
    watchers.add(watcher);
    return () => watchers.delete(watcher);
  },
};
