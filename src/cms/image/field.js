// The image field: an image from the image library, with its alt text. Choosing an image copies
// its alt text here, as /image does in a body (ADR 0055), and it can then be changed here without
// changing the library. The chooser is the body's, with its upload to the library.
//
// In the library's own entry the field chooses nothing from the library: there it is the entry's
// file, which a new entry uploads, saved in the same commit as the entry, and a saved one shows.
//
// A field whose image falls back to the post's main image (`fallback`) shows that image, faded,
// while none is chosen. A field whose image is cropped to a size (`crop`, { width, height })
// shows it so, with the part every service shows (`safe`) marked in the middle.

import '../body/field.css';
import { chooseImage } from '../body/chooser.js';
import { uploadProblem } from '../body/chooser-check.js';
import { button, made } from '../body/dialog.js';
import { stemOf } from '../body/library.js';
import { say } from '../interface-language.js';
import { MEDIA_FOLDER } from '../../format/masters.js';
import { kindOf } from '../../format/originals.js';
import { wordsShown } from '../refusals.js';
import './field.css';

const EXTENSIONS = { jpeg: 'jpg', png: 'png', webp: 'webp', svg: 'svg' };

const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const fileNameOf = (address) => {
  const last = address.split(/[?#]/)[0].split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

export function mountImageField(host, { value, changed, addFile, library, exists, alt: withAlt = true, text = false, upload = false, smallestWidth = null, fallback = false, crop = null, safe = null }) {
  const hasAlt = withAlt && !text;
  let src = '';
  let altText = '';
  let standIn = '';

  const read = (given) => {
    if (text) return { src: typeof given === 'string' ? given : '', alt: '' };
    return { src: typeof given?.src === 'string' ? given.src : '', alt: typeof given?.alt === 'string' ? given.alt : '' };
  };

  const root = made('div', crop ? 'konzilo-pick konzilo-pick-crop' : 'konzilo-pick', host);
  const frame = made('div', 'konzilo-pick-picture', root);
  if (crop) frame.style.aspectRatio = `${crop.width} / ${crop.height}`;
  const picture = made('img', '', frame);
  picture.alt = '';
  if (crop && safe) {
    const zone = made('span', 'konzilo-pick-safe', frame);
    zone.style.width = `${(safe.width / crop.width) * 100}%`;
    zone.style.height = `${(safe.height / crop.height) * 100}%`;
    zone.title = say('image.safe', safe);
  }
  const empty = made('span', 'konzilo-pick-empty', frame);
  const side = made('div', 'konzilo-pick-side', root);
  const name = made('p', 'konzilo-pick-name', side);
  const buttons = made('div', 'konzilo-pick-buttons', side);
  const choose = upload ? null : button('konzilo-pick-choose', '', buttons);
  const remove = upload ? null : button('konzilo-pick-remove', say('image.remove'), buttons);
  const pick = upload ? button('konzilo-pick-choose', say('image.pickFile'), buttons) : null;
  const input = upload ? made('input', '', side) : null;
  if (input) {
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/svg+xml';
    input.hidden = true;
  }
  const note = made('p', 'konzilo-pick-note', side);
  note.setAttribute('role', 'alert');
  const altRow = hasAlt ? made('label', 'konzilo-pick-alt', root) : null;
  const altInput = altRow ? made('input', '', altRow) : null;
  if (altRow) {
    altRow.prepend(Object.assign(document.createElement('span'), { textContent: say('image.alt') }));
    altInput.type = 'text';
  }

  const emit = () => {
    if (text) changed(src);
    else if (src === '') changed(null);
    else changed(hasAlt && altText !== '' ? { src, alt: altText } : { src });
  };

  // An uploaded file has a blob: address until the entry is saved. The name it gets is kept
  // here, so that the field shows it and not the address.
  const uploadedNames = new Map();

  // An image shows once fetched, and only if no other has been chosen meanwhile.
  let shownFor = 0;
  const render = () => {
    const shown = src !== '';
    const unsaved = src.startsWith('blob:');
    const standing = !shown && fallback && standIn !== '';
    name.textContent = shown ? uploadedNames.get(src) ?? fileNameOf(src) : standing ? say('image.main') : '';
    name.hidden = !shown && !standing;
    frame.classList.toggle('konzilo-pick-standin', standing);
    if (choose) choose.textContent = say(shown ? 'image.change' : 'image.choose');
    if (remove) remove.hidden = !shown;
    // A saved entry's file is the entry. Before it is saved, another may be chosen.
    if (pick) {
      pick.hidden = shown && !unsaved;
      pick.textContent = say(unsaved ? 'image.pickOther' : 'image.pickFile');
    }
    if (altRow) altRow.hidden = !shown;
    if (altInput && altInput.value !== altText) altInput.value = altText;
    const now = ++shownFor;
    picture.hidden = true;
    empty.hidden = false;
    empty.textContent = say(shown || standing ? 'image.loading' : upload ? 'image.noFile' : 'image.none');
    if (!shown && !standing) return;
    const showingSrc = shown ? src : standIn;
    const showing = (address) => {
      if (now !== shownFor) return;
      if (address) {
        picture.src = address;
        picture.hidden = false;
        empty.hidden = true;
      } else {
        empty.textContent = say('image.cannotShow');
      }
    };
    if (showingSrc.startsWith('blob:')) showing(showingSrc);
    else void (library?.picture(showingSrc) ?? Promise.resolve(null)).then(showing);
  };

  choose?.addEventListener('click', async () => {
    if (!library) return;
    const chosen = await chooseImage({ library, smallestWidth });
    if (!chosen) return;
    src = chosen.src;
    altText = hasAlt ? chosen.alt ?? '' : '';
    note.textContent = '';
    render();
    emit();
  });

  remove?.addEventListener('click', () => {
    src = '';
    altText = '';
    render();
    emit();
  });

  altInput?.addEventListener('input', () => {
    altText = altInput.value;
    emit();
  });

  pick?.addEventListener('click', () => input.click());
  input?.addEventListener('change', async () => {
    const [file] = input.files;
    input.value = '';
    if (!file) return;
    note.textContent = '';
    pick.disabled = true;
    try {
      const problem = await uploadProblem(file, { smallestWidth }).catch(() => null);
      if (problem !== null) {
        note.textContent = wordsShown(problem);
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extension = EXTENSIONS[kindOf(bytes)];
      if (!extension) {
        note.textContent = say('image.notImage');
        return;
      }
      // The name the library's upload gives: the same file twice is one original.
      const named = `${stemOf(file.name)}-${hex(await globalThis.crypto.subtle.digest('SHA-256', bytes)).slice(0, 10)}.${extension}`;
      src = (await exists(`${MEDIA_FOLDER}/${named}`)) ? `/${MEDIA_FOLDER}/${named}` : await addFile(new File([bytes], named, { type: file.type }));
      uploadedNames.set(src, named);
      render();
      emit();
    } catch (error) {
      console.warn(`The file was not added: ${error.message}`);
      note.textContent = say('image.notAdded');
    } finally {
      pick.disabled = false;
    }
  });

  ({ src, alt: altText } = read(value));
  render();

  return {
    setStandIn(next) {
      const given = typeof next === 'string' ? next : '';
      if (given === standIn) return;
      standIn = given;
      if (src === '') render();
    },
    setValue(next) {
      const given = read(next);
      if (given.src === src && given.alt === altText) return;
      ({ src, alt: altText } = given);
      render();
    },
    destroy() {
      shownFor += 1;
      root.remove();
    },
  };
}
