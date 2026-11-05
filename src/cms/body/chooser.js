// The chooser `/image` opens (ADR 0055): the library's entries as small pictures, and a way to
// upload a new one, which joins the library and becomes the choice. It is a dialog of plain
// elements over the whole page, and gives what was chosen, { src, alt, caption }, or null.

import { uploadProblem } from './chooser-check.js';
import { say } from './texts.js';

const made = (tag, className, parent) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  parent?.append(element);
  return element;
};

const button = (className, words, parent) => {
  const element = made('button', className, parent);
  element.type = 'button';
  element.textContent = words;
  return element;
};

function textRow(parent, words, { required = false } = {}) {
  const row = made('label', 'konzilo-chooser-row', parent);
  made('span', '', row).textContent = words;
  const input = made('input', '', row);
  input.type = 'text';
  input.required = required;
  return input;
}

export function chooseImage({ library, smallestWidth = null, root = document.body }) {
  return new Promise((resolve) => {
    const dialog = made('dialog', 'konzilo-chooser');
    dialog.setAttribute('aria-label', say('imageChoose'));
    const head = made('div', 'konzilo-chooser-head', dialog);
    made('h2', '', head).textContent = say('imageChoose');
    const close = button('konzilo-chooser-close', say('imageClose'), head);
    const body = made('div', 'konzilo-chooser-body', dialog);

    let shownFile = null;
    const letGoOfFile = () => {
      if (shownFile !== null) URL.revokeObjectURL(shownFile);
      shownFile = null;
    };
    let watcher = null;
    const stopWatching = () => watcher?.disconnect();

    let done = false;
    const finish = (chosen) => {
      if (done) return;
      done = true;
      stopWatching();
      letGoOfFile();
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(chosen);
    };
    dialog.addEventListener('close', () => finish(null));
    close.addEventListener('click', () => finish(null));

    const showUpload = (returnTo) => {
      stopWatching();
      letGoOfFile();
      const form = made('form', 'konzilo-chooser-upload');
      form.noValidate = true;
      body.replaceChildren(form);
      button('konzilo-chooser-back', say('imageBack'), form).addEventListener('click', returnTo);
      const fileRow = made('label', 'konzilo-chooser-row', form);
      made('span', '', fileRow).textContent = say('imageFile');
      const input = made('input', '', fileRow);
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp,image/svg+xml';
      const preview = made('img', 'konzilo-chooser-preview', form);
      preview.alt = '';
      preview.hidden = true;
      const alt = textRow(form, say('imageAlt'), { required: true });
      const caption = textRow(form, say('imageCaption'));
      const note = made('p', 'konzilo-chooser-note', form);
      note.setAttribute('role', 'alert');
      const send = made('button', 'konzilo-chooser-send', form);
      send.type = 'submit';
      send.textContent = say('imageUpload');

      input.addEventListener('change', () => {
        letGoOfFile();
        const [file] = input.files;
        note.textContent = '';
        preview.hidden = !file;
        if (!file) return;
        shownFile = URL.createObjectURL(file);
        preview.src = shownFile;
      });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const [file] = input.files;
        if (!file) {
          note.textContent = say('imageNoFile');
          return;
        }
        if (alt.value.trim() === '') {
          note.textContent = say('imageNoAlt');
          alt.focus();
          return;
        }
        note.textContent = '';
        send.disabled = true;
        send.textContent = say('imageUploading');
        try {
          const problem = await uploadProblem(file, { smallestWidth });
          if (problem !== null) {
            note.textContent = problem;
            return;
          }
          finish(await library.add({ file, alt: alt.value, caption: caption.value }));
        } catch (error) {
          console.warn(`The image was not uploaded: ${error.message}`);
          note.textContent = say('imageUploadFailed');
        } finally {
          send.disabled = false;
          send.textContent = say('imageUpload');
        }
      });
      input.focus();
    };

    const showList = async () => {
      stopWatching();
      letGoOfFile();
      const tools = made('div', 'konzilo-chooser-tools');
      const search = made('input', '', tools);
      search.type = 'search';
      search.placeholder = say('imageSearch');
      search.setAttribute('aria-label', say('imageSearch'));
      // A search box's own Escape only empties it, in some browsers, and the dialog stays.
      search.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') finish(null);
      });
      button('konzilo-chooser-new', say('imageNew'), tools).addEventListener('click', () => showUpload(showList));
      const status = made('p', 'konzilo-chooser-status');
      status.setAttribute('role', 'status');
      status.textContent = say('imageLoading');
      const grid = made('ul', 'konzilo-chooser-grid');
      body.replaceChildren(tools, status, grid);
      search.focus();

      let entries;
      try {
        entries = await library.list();
      } catch (error) {
        if (done) return;
        console.warn(`The image library could not be read: ${error.message}`);
        status.textContent = say('imageListFailed');
        button('konzilo-chooser-retry', say('imageRetry'), status).addEventListener('click', showList);
        return;
      }
      if (done) return;
      status.textContent = entries.length === 0 ? say('imageEmpty') : '';

      // A picture is asked for when it comes into view: a library can be long.
      watcher = new globalThis.IntersectionObserver((seen) => {
        for (const { isIntersecting, target } of seen) {
          if (!isIntersecting) continue;
          watcher.unobserve(target);
          void library.picture(target.dataset.src).then((address) => {
            if (address) target.src = address;
          });
        }
      }, { root: dialog });

      const items = entries.map((entry) => {
        const item = made('li', '', grid);
        const choose = made('button', 'konzilo-chooser-item', item);
        choose.type = 'button';
        const picture = made('img', '', choose);
        picture.alt = '';
        picture.dataset.src = entry.src;
        made('span', '', choose).textContent = entry.alt;
        choose.title = entry.caption ? `${entry.alt}\n${entry.caption}` : entry.alt;
        choose.addEventListener('click', () => finish(entry));
        watcher.observe(picture);
        return { item, words: `${entry.alt} ${entry.caption}`.toLowerCase() };
      });
      search.addEventListener('input', () => {
        const sought = search.value.trim().toLowerCase();
        let left = 0;
        for (const { item, words } of items) {
          item.hidden = !words.includes(sought);
          if (!item.hidden) left += 1;
        }
        if (entries.length > 0) status.textContent = left === 0 ? say('imageNoneFound') : '';
      });
    };

    root.append(dialog);
    dialog.showModal();
    void showList();
  });
}
