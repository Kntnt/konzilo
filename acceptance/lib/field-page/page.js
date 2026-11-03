// A page with the body field alone, no Sveltia and no Compose: the test mounts it on a value,
// drives it with a real keyboard where an editor would, and reads what it told its owner.

import { toggleMark } from '@milkdown/kit/prose/commands';
import { undo } from '@milkdown/kit/prose/history';
import { Selection, TextSelection } from '@milkdown/kit/prose/state';

import { handsFor, loadReader } from '../../../src/cms/body/check.js';
import { mountBodyField } from '../../../src/cms/body/field.js';
import { checkBody } from '../../../src/format/body.js';

const EVERY_ELEMENT = ['paragraph', 'heading', 'list', 'quote', 'code', 'table', 'footnotes', 'embed', 'image', 'gallery', 'post-list', 'form'];

let fields = [];

// A list item puts back the selection it saw when it mounted, one frame later (Milkdown's
// component does, which is issues 2501 and 2506), so a page with a list settles for a frame
// before it is driven. A person cannot type that soon after opening.
const settled = () => new Promise((resolve) => {
  if (document.querySelector('.milkdown-list-item-block')) requestAnimationFrame(() => setTimeout(resolve, 0));
  else setTimeout(resolve, 0);
});

// `answering` keeps what the field writes, as an owner would hold it on its way back, until
// the test lets the answers come.
const mount = (value, { elements = EVERY_ELEMENT, forms = ['contact', 'newsletter'], answering = false } = {}) => {
  const changes = [];
  const answers = [];
  const host = document.createElement('div');
  document.body.append(host);
  const changed = (next) => {
    changes.push(next);
    if (answering) answers.push(next);
  };
  const field = mountBodyField(host, { value, changed, elements, forms, adminHost: null });
  return { field, changes, host, answers };
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
  // The early check's verdict, as the browser gives it.
  async check(body, forms) {
    const { body: written, problems } = checkBody(body, handsFor(await loadReader(), { elements: EVERY_ELEMENT, forms }));
    return { written, reasons: problems.map(({ reason }) => reason) };
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
