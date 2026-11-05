// The dialog behind the button on an image in the field: its alt text, and taking it out, which
// asks first. It gives { alt } or { remove: true } when an answer is reached, and null when it was
// left, with nothing changed. `address` is the picture to describe, when there is one to show.

import { asking, button, dialogOf, made, textRow } from './dialog.js';
import { say } from './texts.js';

export function editImage({ alt, address = null, root = document.body }) {
  return new Promise((resolve) => {
    const { dialog, body } = dialogOf(say('imageEdit'));
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

    if (address !== null) {
      const picture = made('img', 'konzilo-image-editing-picture', body);
      picture.alt = '';
      picture.src = address;
    }

    const form = made('form', 'konzilo-dialog-form', body);
    form.noValidate = true;
    const field = textRow(form, say('imageAlt'), { required: true });
    field.value = alt;
    const note = made('p', 'konzilo-dialog-note', form);
    note.setAttribute('role', 'alert');
    const actions = made('div', 'konzilo-dialog-actions', form);
    const remove = button('konzilo-dialog-remove', say('imageRemove'), actions);
    button('', say('imageCancel'), actions).addEventListener('click', () => finish(null));
    const accept = made('button', 'konzilo-dialog-accept', actions);
    accept.type = 'submit';
    accept.textContent = say('imageDone');

    field.addEventListener('input', () => {
      note.textContent = '';
      field.removeAttribute('aria-invalid');
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const written = field.value.trim();
      if (written !== '') {
        finish({ alt: written });
        return;
      }
      note.textContent = say('imageNoAlt');
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    });

    const backToForm = () => {
      question.replaceWith(form);
      remove.focus();
    };
    const { part: question, keep } = asking({ words: say('imageRemoveAsk'), aside: say('imageRemoveAside'), keepWords: say('imageKeep'), kept: backToForm, removed: () => finish({ remove: true }) });
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
