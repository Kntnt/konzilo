// The dialog behind the pen on a gallery (ADR 0055): its images in their order, each with its alt
// text, a way to move or remove each, to add more and to take the gallery out, which asks first.
// Nothing changes until it is done, so an image goes from its row without asking. It gives
// { images } in their new order, as they were handed in with the alt text as written, { remove: true },
// or null when it was left. `choose` gives more images, or null where there is no library.

import { asking, button, dialogOf, made } from './dialog.js';
import { say } from './texts.js';

export function editGallery({ images, choose = null, picture = null, root = document.body }) {
  return new Promise((resolve) => {
    const { dialog, body } = dialogOf(say('galleryEdit'));
    dialog.classList.add('konzilo-gallery-editing');
    let done = false;
    const finish = (answer) => {
      if (done) return;
      done = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(answer);
    };
    dialog.addEventListener('close', () => finish(null));

    const form = made('form', 'konzilo-gallery-form', body);
    form.noValidate = true;
    const list = made('ul', 'konzilo-gallery-rows', form);
    const rows = new Map();

    let dragged = null;
    const clearMark = () => {
      for (const marked of list.querySelectorAll('[data-drop]')) delete marked.dataset.drop;
    };
    // The row under the pointer, and which side of it.
    const landingOf = ({ target, clientY }) => {
      const row = target.closest?.('.konzilo-gallery-row');
      if (!row) return null;
      const { top, height } = row.getBoundingClientRect();
      return { row, after: clientY >= top + height / 2 };
    };

    const addRow = (entry) => {
      const row = made('li', 'konzilo-gallery-row', list);
      // Only the handle drags: Firefox lets no field in something draggable take the mouse.
      const handle = made('span', 'konzilo-gallery-handle', row);
      handle.textContent = '≡';
      handle.title = say('galleryDrag');
      handle.setAttribute('aria-hidden', 'true');
      handle.draggable = true;
      handle.addEventListener('dragstart', (event) => {
        dragged = row;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-konzilo-row', '');
        event.dataTransfer.setDragImage(row, 20, 20);
      });

      const thumbnail = made('img', 'konzilo-gallery-thumbnail', row);
      thumbnail.alt = '';
      void Promise.resolve(picture?.(entry.src)).catch(() => null).then((address) => {
        if (address) thumbnail.src = address;
      });

      const label = made('label', 'konzilo-gallery-alt', row);
      made('span', '', label).textContent = say('imageAlt');
      const input = made('input', '', label);
      input.type = 'text';
      input.value = entry.alt;
      input.addEventListener('input', () => input.removeAttribute('aria-invalid'));

      // The keyboard stays with the row, on the way back once it has reached an end.
      const move = (className, words, sign, shift) => {
        const control = button(className, sign, row);
        control.title = words;
        control.setAttribute('aria-label', words);
        control.addEventListener('click', () => {
          shift();
          control.focus();
          if (document.activeElement !== control) row.querySelector(className === 'konzilo-gallery-up' ? '.konzilo-gallery-down' : '.konzilo-gallery-up').focus();
        });
      };
      move('konzilo-gallery-up', say('imageEarlier'), '↑', () => row.previousElementSibling?.before(row));
      move('konzilo-gallery-down', say('imageLater'), '↓', () => row.nextElementSibling?.after(row));

      const remove = button('konzilo-gallery-row-remove', '✕', row);
      remove.title = say('imageRemove');
      remove.setAttribute('aria-label', say('imageRemove'));
      remove.addEventListener('click', () => {
        rows.delete(row);
        row.remove();
      });
      rows.set(row, { entry, input });
    };
    for (const entry of images) addRow(entry);

    // WebKit takes no drop where this is not said on the way in, as well as on the way over.
    list.addEventListener('dragenter', (event) => {
      if (dragged === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    list.addEventListener('dragover', (event) => {
      if (dragged === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearMark();
      const landing = landingOf(event);
      if (landing) landing.row.dataset.drop = landing.after ? 'after' : 'before';
    });
    list.addEventListener('drop', (event) => {
      if (dragged === null) return;
      event.preventDefault();
      const landing = landingOf(event);
      if (landing && landing.row !== dragged) {
        if (landing.after) landing.row.after(dragged);
        else landing.row.before(dragged);
      }
      clearMark();
      dragged = null;
    });
    list.addEventListener('dragend', () => {
      clearMark();
      dragged = null;
    });

    if (choose) {
      button('konzilo-gallery-add', say('galleryAdd'), form).addEventListener('click', async () => {
        const chosen = await choose();
        for (const entry of chosen ?? []) addRow(entry);
      });
    }
    const note = made('p', 'konzilo-dialog-note', form);
    note.setAttribute('role', 'alert');
    const actions = made('div', 'konzilo-dialog-actions', form);
    const removeAll = button('konzilo-dialog-remove', say('galleryRemove'), actions);
    button('', say('imageCancel'), actions).addEventListener('click', () => finish(null));
    const accept = made('button', 'konzilo-dialog-accept', actions);
    accept.type = 'submit';
    accept.textContent = say('imageDone');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const ordered = [...list.children].map((row) => rows.get(row));
      const blank = ordered.filter(({ input }) => input.value.trim() === '');
      for (const { input } of blank) input.setAttribute('aria-invalid', 'true');
      if (blank.length > 0) {
        note.textContent = say('imageNoAlt');
        blank[0].input.focus();
        return;
      }
      finish({ images: ordered.map(({ entry, input }) => ({ ...entry, alt: input.value.trim() })) });
    });

    const backToForm = () => {
      question.replaceWith(form);
      removeAll.focus();
    };
    const { part: question, keep } = asking({ words: say('galleryRemoveAsk'), keepWords: say('galleryKeep'), kept: backToForm, removed: () => finish({ remove: true }) });
    removeAll.addEventListener('click', () => {
      form.replaceWith(question);
      keep.focus();
    });
    // Escape takes one step back, so what was changed before asking is not lost with the dialog.
    dialog.addEventListener('cancel', (event) => {
      if (!question.isConnected) return;
      event.preventDefault();
      backToForm();
    });

    root.append(dialog);
    dialog.showModal();
  });
}
