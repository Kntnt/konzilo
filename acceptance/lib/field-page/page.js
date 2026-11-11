// A page with the body field alone, no Sveltia and no Compose: the test mounts it on a value,
// drives it with a real keyboard where an editor would, and reads what it told its owner.

import { toggleMark } from '@milkdown/kit/prose/commands';
import { undo } from '@milkdown/kit/prose/history';
import { Selection, TextSelection } from '@milkdown/kit/prose/state';

import { mountAuthorsField } from '../../../src/cms/authors/field.js';
import { handsFor, loadReader } from '../../../src/cms/body/check.js';
import { blockAt } from '../../../src/cms/body/place.js';
import { mountBodyField } from '../../../src/cms/body/field.js';
import { useInterfaceLanguage } from '../../../src/cms/body/texts.js';
import { PLACE_EVENT } from '../../../src/cms/preview/paths.js';
import { wordsShown } from '../../../src/cms/refusals.js';
import { checkBody } from '../../../src/format/body.js';

const EVERY_ELEMENT = ['paragraph', 'heading', 'list', 'quote', 'code', 'table', 'footnotes', 'embed', 'image', 'gallery', 'post-list', 'form'];

let fields = [];

// A library with nothing behind it, for what the field does with one. `throwing` says what it
// fails at; `added` is what it was asked to add.
const PICTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==';
const libraryWith = ({ entries = [], throwing = {} }) => {
  const added = [];
  return {
    added,
    entries,
    throwing,
    async list() {
      if (this.throwing.list) throw new Error('the list failed');
      return this.entries;
    },
    async add({ file, alt, caption }) {
      if (this.throwing.add) throw new Error('the upload failed');
      added.push({ name: file.name, size: file.size, alt, caption });
      const entry = { src: `/media/${file.name}`, alt: alt.trim(), caption: caption.trim() };
      return entry;
    },
    picture: async (address) => (address.includes('no-picture') ? null : PICTURE),
  };
};

// A list item puts back the selection it saw when it mounted, one frame later (Milkdown's
// component does, which is issues 2501 and 2506), so a page with a list settles for a frame
// before it is driven. A person cannot type that soon after opening.
const settled = () => new Promise((resolve) => {
  if (document.querySelector('.milkdown-list-item-block')) requestAnimationFrame(() => setTimeout(resolve, 0));
  else setTimeout(resolve, 0);
});

// `answering` keeps what the field writes, as an owner would hold it on its way back, until
// the test lets the answers come. `language` is the interface language, which the editor
// names from its configuration.
const mount = (value, { elements = EVERY_ELEMENT, forms = ['contact', 'newsletter'], answering = false, library = null, smallestWidth = null, language = 'en' } = {}) => {
  useInterfaceLanguage(language);
  const changes = [];
  const answers = [];
  const host = document.createElement('div');
  document.body.append(host);
  const changed = (next) => {
    changes.push(next);
    if (answering) answers.push(next);
  };
  const held = library && libraryWith(library);
  const field = mountBodyField(host, { value, changed, elements, forms, adminHost: null, library: held, smallestWidth });
  return { field, changes, host, answers, library: held };
};

const clear = () => {
  for (const { field, host } of fields) {
    field.destroy();
    host.remove();
  }
  fields = [];
};

const current = () => fields[0];
const viewOf = (index = 0) => fields[index].field.view;
const source = (index = 0) => fields[index].field.frame.querySelector('.konzilo-body-source');

const textblocks = (view) => {
  const found = [];
  view.state.doc.descendants((node, pos) => {
    if (node.isTextblock) found.push({ node, pos });
    return !node.isTextblock;
  });
  return found;
};

const selectAt = (view, selection) => {
  view.focus();
  view.dispatch(view.state.tr.setSelection(selection));
};

const toEnd = (index = 0) => {
  if (fields[index].field.mode === 'markdown') {
    const area = source(index);
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    return;
  }
  const view = viewOf(index);
  view.focus();
  // The first change of selection is what brings Milkdown's trailing paragraph, if any.
  view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));
  view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));
};

globalThis.fieldPage = {
  async open(value, options) {
    clear();
    fields = [mount(value, options)];
    await current().field.ready;
    await settled();
    return current().field.mode;
  },
  async openTwo(one, other) {
    clear();
    fields = [mount(one), mount(other)];
    await Promise.all(fields.map(({ field }) => field.ready));
    await settled();
  },
  settled: () => current().field.ready,
  valuesOfTwo() {
    for (const { field } of fields) field.flush();
    return fields.map(({ field }) => field.value);
  },
  focusEnd: () => toEnd(),
  atEmptyBlock: () => viewOf().state.selection.$from.parent.content.size === 0,
  blockName: () => viewOf().state.selection.$from.parent.type.name,
  focusEndOf: (index) => toEnd(index),
  focusParagraphEnd(index) {
    const view = viewOf();
    const { node, pos } = textblocks(view)[index];
    selectAt(view, TextSelection.create(view.state.doc, pos + 1 + node.content.size));
  },
  focusParagraphStart(index) {
    const view = viewOf();
    selectAt(view, TextSelection.create(view.state.doc, textblocks(view)[index].pos + 1));
  },
  selectText(text, skip = 0) {
    const view = viewOf();
    let left = skip;
    let done = false;
    view.state.doc.descendants((node, pos) => {
      if (done || !node.isText) return;
      for (let at = node.text.indexOf(text); at !== -1 && !done; at = node.text.indexOf(text, at + 1)) {
        if (left > 0) left -= 1;
        else {
          selectAt(view, TextSelection.create(view.state.doc, pos + at, pos + at + text.length));
          done = true;
        }
      }
    });
    if (!done) throw new Error(`no text ${text}`);
  },
  runMark(name) {
    const view = viewOf();
    toggleMark(view.state.schema.marks[name])(view.state, view.dispatch);
  },
  runCommand: (name) => current().field.command(name),
  // What an editor's first moves do, none of which is an edit.
  poke() {
    const { field } = current();
    if (field.mode === 'markdown') {
      const area = source();
      area.focus();
      area.click();
      area.blur();
      return;
    }
    const { view } = field;
    view.focus();
    view.dom.click();
    view.dispatch(view.state.tr.setSelection(Selection.atStart(view.state.doc)));
    view.dom.blur();
    field.flush();
  },
  undoAll() {
    const { field } = current();
    if (field.mode === 'markdown') {
      const area = source();
      area.focus();
      for (let was = null; was !== area.value;) {
        was = area.value;
        document.execCommand('undo');
      }
      return;
    }
    while (undo(field.view.state, field.view.dispatch));
    field.flush();
  },
  remount() {
    const { field, host } = current();
    field.flush();
    field.frame.remove();
    host.append(field.frame);
  },
  paste({ html, text }) {
    const view = viewOf();
    view.focus();
    const data = new DataTransfer();
    if (html) data.setData('text/html', html);
    if (text) data.setData('text/plain', text);
    if (html && !text) data.setData('text/plain', html.replace(/<[^>]*>/g, ''));
    view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  },
  // The early check's verdict, as the browser gives it, each reason in the interface language.
  async check(body, forms) {
    const { body: written, problems } = checkBody(body, handsFor(await loadReader(), { elements: EVERY_ELEMENT, forms }));
    return { written, reasons: problems.map(({ reason }) => wordsShown(reason)) };
  },
  added: () => current().library.added,
  stopThrowing() {
    current().library.throwing = {};
  },
  // Each image as the document holds it.
  images() {
    const found = [];
    viewOf().state.doc.descendants((node) => {
      if (node.type.name === 'konzilo_image') found.push({ src: node.attrs.src, alt: node.attrs.alt, caption: node.textContent });
    });
    return found;
  },
  // The block a place from the preview leads to, or null.
  placeIndex(place) {
    const found = blockAt(viewOf().state.doc, place);
    return found ? viewOf().state.doc.resolve(found.pos).index(0) : null;
  },
  // A click on the preview's page, as the pane tells it, and what the field then frames: the text
  // of the block within the frame, and whether the frame is in sight, or null where it frames none.
  place(detail) {
    for (const ring of document.querySelectorAll('.konzilo-body-ring')) ring.remove();
    globalThis.dispatchEvent(new CustomEvent(PLACE_EVENT, { detail }));
    const ring = current().field.frame.querySelector('.konzilo-body-ring');
    if (!ring) return null;
    const around = ring.getBoundingClientRect();
    const within = ({ left, top, right, bottom }) => left >= around.left && top >= around.top && right <= around.right && bottom <= around.bottom;
    const area = ({ width, height }) => width * height;
    const framed = [...viewOf().dom.querySelectorAll('*')].filter((one) => within(one.getBoundingClientRect())).sort((one, other) => area(other.getBoundingClientRect()) - area(one.getBoundingClientRect()))[0];
    return { text: framed?.textContent ?? null, inSight: around.top >= 0 && around.bottom <= globalThis.innerHeight };
  },
  // Where the cursor is, and whether the field has the focus.
  selection: () => ({ from: viewOf().state.selection.from, to: viewOf().state.selection.to }),
  focused: () => current().field.frame.contains(document.activeElement),
  // Focus elsewhere, as a click in the preview's frame takes it.
  blur() {
    document.activeElement?.blur();
  },
  embeds() {
    const found = [];
    viewOf().state.doc.forEach((node) => {
      if (node.type.name === 'konzilo_embed') found.push(node.attrs.address);
    });
    return found;
  },
  galleries() {
    const found = [];
    viewOf().state.doc.forEach((node) => {
      if (node.type.name !== 'konzilo_gallery') return;
      const images = [];
      node.forEach((child) => {
        if (child.type.name === 'konzilo_image') images.push({ src: child.attrs.src, alt: child.attrs.alt, caption: child.textContent });
      });
      found.push({ images, caption: node.lastChild.textContent });
    });
    return found;
  },
  focusGalleryCaption(index = 0) {
    const view = viewOf();
    const captions = textblocks(view).filter(({ node }) => node.type.name === 'konzilo_gallery_caption');
    const { node, pos } = captions[index];
    selectAt(view, TextSelection.create(view.state.doc, pos + 1 + node.content.size));
  },
  topBlocks() {
    const found = [];
    viewOf().state.doc.forEach((node) => found.push(node.type.name));
    return found;
  },
  selectAll() {
    const view = viewOf();
    selectAt(view, TextSelection.create(view.state.doc, 1, view.state.doc.content.size - 1));
  },
  focusCaption(index = 0) {
    const view = viewOf();
    const captions = textblocks(view).filter(({ node }) => node.type.name === 'konzilo_image');
    const { node, pos } = captions[index];
    selectAt(view, TextSelection.create(view.state.doc, pos + 1 + node.content.size));
  },
  changes: () => current().changes,
  mode: () => current().field.mode,
  value: () => current().field.value,
  written: () => current().field.written(),
  flush: () => current().field.flush(),
  setValue: (value) => current().field.setValue(value),
  answer() {
    const { field, answers } = current();
    for (const next of answers.splice(0)) field.setValue(next);
  },
  sameEditorAs(mark) {
    const { view } = current().field;
    if (mark) globalThis.markedView = view;
    return globalThis.markedView === view;
  },
  tablesAndCells() {
    const count = { table: 0, table_header: 0, table_cell: 0 };
    viewOf().state.doc.descendants((node) => {
      if (node.type.name in count) count[node.type.name] += 1;
    });
    return [count.table, count.table_header + count.table_cell];
  },
  notes: () => [...current().field.frame.querySelectorAll('.konzilo-body-note')].filter((note) => !note.hidden).map((note) => note.textContent),
};

// The authors field alone, on authors with nothing behind them: `authors`, each { id, name }, and
// `throwing`, what they fail at. It records what it told its owner and what it was asked to add.
let authorsField = null;
const failing = {};
globalThis.authorsPage = {
  open(value, { authors = [], throwing = {}, language = 'en' } = {}) {
    authorsField?.field.destroy();
    authorsField?.host.remove();
    useInterfaceLanguage(language);
    Object.assign(failing, { list: false, add: false }, throwing);
    const known = [...authors];
    const added = [];
    const source = {
      async list() {
        if (failing.list) throw new Error('the list failed');
        return [...known];
      },
      async add({ name, biography }) {
        if (failing.add) throw new Error('the commit failed');
        added.push({ name, biography });
        const made = { id: `new${added.length}`, name: name.trim() };
        known.push(made);
        return made;
      },
    };
    const host = document.createElement('div');
    const before = Object.assign(document.createElement('input'), { type: 'text', className: 'before-the-field' });
    before.setAttribute('aria-label', 'Before the field');
    host.append(before);
    document.body.append(host);
    const changes = [];
    const field = mountAuthorsField(host, { value, changed: (next) => changes.push(next), authors: source, label: 'Authors', forID: 'the-authors' });
    authorsField = { field, host, changes, added };
    return field.ready;
  },
  value: () => authorsField.changes.at(-1) ?? null,
  changes: () => authorsField.changes.length,
  added: () => authorsField.added,
  setValue: (value) => authorsField.field.setValue(value),
  stopThrowing() {
    Object.assign(failing, { list: false, add: false });
  },
};
