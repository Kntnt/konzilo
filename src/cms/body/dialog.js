// What the field's dialogs are made of. A dialog stands over the whole page, outside the editor,
// so that what happens in it is no change to the text until it closes with an answer.

import { say } from './texts.js';

export const made = (tag, className, parent) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  parent?.append(element);
  return element;
};

export const button = (className, words, parent) => {
  const element = made('button', className, parent);
  element.type = 'button';
  element.textContent = words;
  return element;
};

export function textRow(parent, words, { required = false } = {}) {
  const row = made('label', 'konzilo-dialog-row', parent);
  made('span', '', row).textContent = words;
  const input = made('input', '', row);
  input.type = 'text';
  input.required = required;
  return input;
}

export function dialogOf(title) {
  const dialog = made('dialog', 'konzilo-dialog');
  dialog.setAttribute('aria-label', title);
  const head = made('div', 'konzilo-dialog-head', dialog);
  made('h2', '', head).textContent = title;
  const body = made('div', 'konzilo-dialog-body', dialog);
  return { dialog, head, body };
}

// The question before something is taken out, with the safe answer to hand.
export function asking({ words, keepWords, kept, removed }) {
  const part = made('div', 'konzilo-dialog-asking');
  made('p', '', part).textContent = words;
  made('p', 'konzilo-dialog-aside', part).textContent = say('imageRemoveAside');
  const answers = made('div', 'konzilo-dialog-actions', part);
  const keep = button('', keepWords, answers);
  keep.addEventListener('click', kept);
  button('konzilo-dialog-remove-now', say('imageRemoveNow'), answers).addEventListener('click', removed);
  return { part, keep };
}
