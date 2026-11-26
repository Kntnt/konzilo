// The dialog behind the button on an image in the field: its alt text, its focal point, and taking
// it out, which asks first. It gives { alt, focalPoint } or { remove: true } when an answer is
// reached, and null when it was left, with nothing changed. `address` is the picture to describe,
// when there is one to show, on which the focal point `focalPoint`, { x, y } or null, is moved by the `frames` of
// the site's aspect ratios (ADR 0055, image/focal-point.js).

import { asking, button, dialogOf, made, textRow } from './dialog.js';
import { focalPointPicker } from '../image/focal-point.js';
import { say } from '../interface-language.js';

export function editImage({ alt, address = null, focalPoint = null, frames = [], root = document.body }) {
  return new Promise((resolve) => {
    const { dialog, body } = dialogOf(say('body.imageEdit'));
    dialog.classList.add('konzilo-dialog-narrow');

    let done = false;
    const finish = (answer) => {
      if (done) return;
      done = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(answer);
    };
    dialog.addEventListener('close', () => finish(null));

    const picker = address === null ? null : focalPointPicker(body, { address, focalPoint, frames });

    const form = made('form', 'konzilo-dialog-form', body);
    form.noValidate = true;
    const field = textRow(form, say('body.alt'), { required: true });
    field.value = alt;
    const note = made('p', 'konzilo-dialog-note', form);
    note.setAttribute('role', 'alert');
    const actions = made('div', 'konzilo-dialog-actions', form);
    const remove = button('konzilo-dialog-remove', say('body.imageRemove'), actions);
    button('', say('body.cancel'), actions).addEventListener('click', () => finish(null));
    const accept = made('button', 'konzilo-dialog-accept', actions);
    accept.type = 'submit';
    accept.textContent = say('body.done');

    field.addEventListener('input', () => {
      note.textContent = '';
      field.removeAttribute('aria-invalid');
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const written = field.value.trim();
      if (written !== '') {
        finish({ alt: written, focalPoint: picker ? picker.read() : focalPoint });
        return;
      }
      note.textContent = say('body.noAlt');
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    });

    const backToForm = () => {
      question.replaceWith(form);
      remove.focus();
    };
    const { part: question, keep } = asking({ words: say('body.imageRemoveAsk'), aside: say('body.imageRemoveAside'), keepWords: say('body.imageKeep'), kept: backToForm, removed: () => finish({ remove: true }) });
    remove.addEventListener('click', () => {
      form.replaceWith(question);
      keep.focus();
    });
    // Escape takes one step back, so what was typed before asking is not lost with the dialog.
    dialog.addEventListener('cancel', (event) => {
      if (!question.isConnected) return;
      event.preventDefault();
      backToForm();
    });

    root.append(dialog);
    dialog.showModal();
    field.focus();
    field.setSelectionRange(alt.length, alt.length);
  });
}
