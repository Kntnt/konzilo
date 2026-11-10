// The chooser `/image` opens (ADR 0055): the library's entries as small pictures, and a way to
// upload a new one, which joins the library and becomes the choice. It is a dialog of plain
// elements over the whole page, and gives what was chosen, { src, alt, caption }, or null. With
// `several`, as for a gallery, each click picks or lets go, an upload is picked too, and it gives
// what was picked, in that order, or null.

import { uploadProblem } from './chooser-check.js';
import { button, dialogOf, made, textRow } from './dialog.js';
import { say } from './texts.js';

const same = (one, other) => one.src === other.src && one.alt === other.alt && (one.caption ?? '') === (other.caption ?? '');

export function chooseImage({ library, smallestWidth = null, several = false, root = document.body }) {
  return new Promise((resolve) => {
    const { dialog, head, body } = dialogOf(say(several ? 'body.chooseImages' : 'body.chooseImage'));
    const close = button('', say('body.close'), head);
    const picked = [];
    const add = several ? button('', '', made('div', 'konzilo-chooser-foot', dialog)) : null;
    const showPicked = () => {
      add.disabled = picked.length === 0;
      add.textContent = picked.length === 1 ? say('body.addImagesOne') : say(picked.length === 0 ? 'body.addImagesNone' : 'body.addImages', { count: picked.length });
    };
    if (several) {
      add.addEventListener('click', () => finish(picked));
      showPicked();
    }

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
      button('konzilo-chooser-back', say('body.libraryBack'), form).addEventListener('click', returnTo);
      const fileRow = made('label', 'konzilo-dialog-row', form);
      made('span', '', fileRow).textContent = say('body.uploadFile');
      const input = made('input', '', fileRow);
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp,image/svg+xml';
      const preview = made('img', 'konzilo-chooser-preview', form);
      preview.alt = '';
      preview.hidden = true;
      const alt = textRow(form, say('body.alt'), { required: true });
      const caption = textRow(form, say('body.uploadCaption'));
      const note = made('p', 'konzilo-dialog-note', form);
      note.setAttribute('role', 'alert');
      const send = made('button', 'konzilo-chooser-send', form);
      send.type = 'submit';
      send.textContent = say('body.upload');

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
          note.textContent = say('body.uploadNoFile');
          return;
        }
        if (alt.value.trim() === '') {
          note.textContent = say('body.noAlt');
          alt.focus();
          return;
        }
        note.textContent = '';
        send.disabled = true;
        send.textContent = say('body.uploading');
        try {
          const problem = await uploadProblem(file, { smallestWidth });
          if (problem !== null) {
            note.textContent = problem;
            return;
          }
          const entry = await library.add({ file, alt: alt.value, caption: caption.value });
          if (!several) {
            finish(entry);
            return;
          }
          picked.push(entry);
          showPicked();
          returnTo();
        } catch (error) {
          console.warn(`The image was not uploaded: ${error.message}`);
          note.textContent = say('body.uploadFailed');
        } finally {
          send.disabled = false;
          send.textContent = say('body.upload');
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
      search.placeholder = say('body.librarySearch');
      search.setAttribute('aria-label', say('body.librarySearch'));
      // A search box's own Escape only empties it, in some browsers, and the dialog stays. Taken
      // here, it must go no further, or it closes a dialog this one was opened from as well.
      search.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        finish(null);
      });
      button('konzilo-chooser-new', say('body.libraryNew'), tools).addEventListener('click', () => showUpload(showList));
      const status = made('p', 'konzilo-chooser-status');
      status.setAttribute('role', 'status');
      status.textContent = say('body.libraryLoading');
      const grid = made('ul', 'konzilo-chooser-grid');
      body.replaceChildren(tools, status, grid);
      search.focus();

      let entries;
      try {
        entries = await library.list();
      } catch (error) {
        if (done) return;
        console.warn(`The image library could not be read: ${error.message}`);
        status.textContent = say('body.libraryFailed');
        button('konzilo-chooser-retry', say('body.libraryRetry'), status).addEventListener('click', showList);
        return;
      }
      if (done) return;
      // What was uploaded a moment ago may not be in the list yet.
      for (const entry of picked) if (!entries.some((one) => same(one, entry))) entries.push(entry);
      status.textContent = entries.length === 0 ? say('body.libraryEmpty') : '';

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
        const order = several ? made('span', 'konzilo-chooser-order', choose) : null;
        order?.setAttribute('aria-hidden', 'true');
        choose.addEventListener('click', () => {
          if (!several) {
            finish(entry);
            return;
          }
          const at = picked.findIndex((one) => same(one, entry));
          if (at === -1) picked.push(entry);
          else picked.splice(at, 1);
          showPicked();
          markPicked();
        });
        watcher.observe(picture);
        return { item, choose, order, entry, words: `${entry.alt} ${entry.caption}`.toLowerCase() };
      });
      const markPicked = () => {
        for (const { choose, order, entry } of items) {
          const at = picked.findIndex((one) => same(one, entry));
          choose.setAttribute('aria-pressed', String(at !== -1));
          order.textContent = at === -1 ? '' : String(at + 1);
        }
      };
      if (several) markPicked();
      search.addEventListener('input', () => {
        const sought = search.value.trim().toLowerCase();
        let left = 0;
        for (const { item, words } of items) {
          item.hidden = !words.includes(sought);
          if (!item.hidden) left += 1;
        }
        if (entries.length > 0) status.textContent = left === 0 ? say('body.libraryNoneFound') : '';
      });
    };

    root.append(dialog);
    dialog.showModal();
    void showList();
  });
}
