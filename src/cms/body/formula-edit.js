// The dialog for a formula's LaTeX: for a new one from the toolbar or `/`, and behind a click on
// one that stands, where it can also be taken out, which asks first. It shows the formula as the
// site will, drawn by the same Temml as it is typed, and takes no formula Temml cannot read, in the
// words the intake would refuse it in, nor an inline formula that holds a `$`. It gives { latex }
// or { remove: true } when an answer is reached, and null when it was left, with nothing changed.

import { formulaReason, mathML } from '../../format/mathml.js';
import { asking, button, dialogOf, made } from './dialog.js';
import { wordsShown } from '../refusals.js';
import { say } from '../interface-language.js';

const capitalised = (words) => words.charAt(0).toUpperCase() + words.slice(1);

// Why a formula cannot be taken as it is written, or null.
function refusalOf(latex, display) {
  if (latex === '') return say('body.formulaEmpty');
  if (!display && latex.includes('$')) return say('body.formulaDollar');
  const reason = formulaReason(latex, display);
  return reason ? capitalised(wordsShown(reason)) : null;
}

// `display` for a block formula, which takes lines; an inline formula takes one. `adding` for a
// new one, which may start from a text, and has nothing to remove.
export function editFormula({ latex = null, display = false, adding = latex === null, root = document.body } = {}) {
  return new Promise((resolve) => {
    const title = adding ? (display ? 'body.blockFormulaAdd' : 'body.formulaAdd') : (display ? 'body.blockFormulaEdit' : 'body.formulaEdit');
    const { dialog, body } = dialogOf(say(title));
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
    const row = made('label', 'konzilo-dialog-row', form);
    made('span', '', row).textContent = say('body.formulaLatex');
    const field = made(display ? 'textarea' : 'input', 'konzilo-formula-latex', row);
    if (display) field.rows = 4;
    else field.type = 'text';
    field.value = latex ?? '';
    field.spellcheck = false;
    field.setAttribute('autocapitalize', 'off');
    const shown = made('div', 'konzilo-formula-preview', form);
    shown.setAttribute('aria-live', 'polite');
    const note = made('p', 'konzilo-dialog-note', form);
    note.setAttribute('role', 'alert');
    const actions = made('div', 'konzilo-dialog-actions', form);
    const remove = adding ? null : button('konzilo-dialog-remove', say('body.formulaRemove'), actions);
    button('', say('body.cancel'), actions).addEventListener('click', () => finish(null));
    const accept = made('button', 'konzilo-dialog-accept', actions);
    accept.type = 'submit';
    accept.textContent = say('body.done');

    // The formula as the site shows it, as it is written.
    const show = () => {
      const written = field.value.trim();
      shown.innerHTML = written === '' ? '' : mathML(written, display);
    };
    show();
    field.addEventListener('input', () => {
      note.textContent = '';
      field.removeAttribute('aria-invalid');
      show();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const written = field.value.trim();
      const refused = refusalOf(written, display);
      if (!refused) {
        finish({ latex: written });
        return;
      }
      note.textContent = refused;
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    });
    // In a block formula's lines, Enter is a new line, and Ctrl or ⌘ with it is done.
    if (display) {
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
    }

    if (remove) {
      const backToForm = () => {
        question.replaceWith(form);
        remove.focus();
      };
      const { part: question, keep } = asking({ words: say('body.formulaRemoveAsk'), keepWords: say('body.formulaKeep'), kept: backToForm, removed: () => finish({ remove: true }) });
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
