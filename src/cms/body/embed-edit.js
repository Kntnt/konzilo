// The dialog for an embed's address: for a new one from `/embed`, and behind the pen on one that
// stands, where it can also be taken out, which asks first. It takes no address the site could not
// embed, in the site's words. It gives { address } or { remove: true } when an answer is reached,
// and null when it was left, with nothing changed.

import { embedOf } from '../../format/embeds.js';
import rules from '../../format/rules.json' with { type: 'json' };
import { asking, button, dialogOf, made, textRow } from './dialog.js';
import { say } from './texts.js';

const capitalised = (words) => words.charAt(0).toUpperCase() + words.slice(1);

export function editEmbed({ address = null, root = document.body } = {}) {
  return new Promise((resolve) => {
    const { dialog, body } = dialogOf(say(address === null ? 'body.embedAdd' : 'body.embedEdit'));
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

    const form = made('form', 'konzilo-dialog-form', body);
    form.noValidate = true;
    const field = textRow(form, say('body.embedAddress'), { required: true });
    field.value = address ?? '';
    field.spellcheck = false;
    const names = Object.values(rules.embeds.services).map(({ name }) => name).join(', ');
    made('p', 'konzilo-dialog-aside', form).textContent = say('body.embedServices', { names });
    const note = made('p', 'konzilo-dialog-note', form);
    note.setAttribute('role', 'alert');
    const actions = made('div', 'konzilo-dialog-actions', form);
    const remove = address === null ? null : button('konzilo-dialog-remove', say('body.embedRemove'), actions);
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
      const refused = written === '' ? say('body.embedNoAddress') : embedOf(written, rules).reason;
      if (!refused) {
        finish({ address: written });
        return;
      }
      note.textContent = capitalised(refused);
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    });

    if (remove) {
      const backToForm = () => {
        question.replaceWith(form);
        remove.focus();
      };
      const { part: question, keep } = asking({ words: say('body.embedRemoveAsk'), keepWords: say('body.embedKeep'), kept: backToForm, removed: () => finish({ remove: true }) });
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
    }

    root.append(dialog);
    dialog.showModal();
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  });
}
