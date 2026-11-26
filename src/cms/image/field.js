// The image field: an image from the image library, with its alt text. Choosing an image copies
// its alt text here, as /image does in a body (ADR 0055), and it can then be changed here without
// changing the library. The chooser is the body's, with its upload to the library.
//
// In the library's own entry the field chooses nothing from the library: there it is the entry's
// file, which a new entry uploads, saved in the same commit as the entry, and a saved one shows.
//
// A field whose image falls back to the post's main image (`fallback`) shows that image, faded,
// while none is chosen. A field whose image is cropped to a size (`crop`, { width, height })
// shows it so, around its focal point, with the part every service shows (`safe`) marked in the
// middle.
//
// A post's image (`frames`) holds its focal point too, `focalPoint`, which choosing an image copies
// from the library with its alt text, and *Focal point…* moves in a dialog, by the frames of the
// site's aspect ratios (focal-point.js), leaving the library as it is.
//
// The library's own entry converts the file chosen before it is added (ADR 0022), with
// *Lossless compression*, ticked for a PNG, under the file: changing it converts the file again
// while the entry is unsaved, and once it is saved, it shows how the file was uploaded
// (`lossless`), and changes nothing. What was chosen is told to `chosenLossless`. The display width
// a file's name gives, `@2x` or `@3x`, or null for any other, is told to `chosenDisplayWidth` once
// the file is added, for the entry's own field of it.

import '../body/field.css';
import { chooseImage } from '../body/chooser.js';
import { uploadProblem } from '../body/chooser-check.js';
import { button, made } from '../body/dialog.js';
import { pictureAddress, stemOf } from '../body/library.js';
import { say } from '../interface-language.js';
import { MEDIA_FOLDER } from '../../format/masters.js';
import { kindOf } from '../../format/originals.js';
import { wordsShown } from '../refusals.js';
import { displayWidthOfFile } from './display-width.js';
import { moveFocalPoint } from './focal-point.js';
import { cropOf, heldFocalPoint } from '../../format/focal-point.js';
import { isConverted, kindOfFile, losslessBox, losslessByDefault, preparedUpload } from './upload.js';
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

const samePoint = (one, other) => one?.x === other?.x && one?.y === other?.y;

export function mountImageField(host, { value, changed, addFile, library, exists, alt: withAlt = true, text = false, upload = false, smallestWidth = null, fallback = false, crop = null, safe = null, frames = null, lossless: savedLossless = false, chosenLossless = () => {}, chosenDisplayWidth = () => {} }) {
  const hasAlt = withAlt && !text;
  const hasPoint = frames !== null && !text;
  let src = '';
  let altText = '';
  let point = null;
  let standIn = '';
  let standInPoint = null;

  const read = (given) => {
    if (text) return { src: typeof given === 'string' ? given : '', alt: '', point: null };
    return { src: typeof given?.src === 'string' ? given.src : '', alt: typeof given?.alt === 'string' ? given.alt : '', point: hasPoint ? heldFocalPoint(given?.focalPoint) : null };
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
  const move = hasPoint && !upload ? button('konzilo-pick-focal', say('image.focalPointMove'), buttons) : null;
  const remove = upload ? null : button('konzilo-pick-remove', say('image.remove'), buttons);
  const pick = upload ? button('konzilo-pick-choose', say('image.pickFile'), buttons) : null;
  const input = upload ? made('input', '', side) : null;
  if (input) {
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/svg+xml';
    input.hidden = true;
  }
  const lossless = upload ? losslessBox(side, 'konzilo-pick-check') : null;
  const status = made('p', 'konzilo-pick-status', side);
  status.setAttribute('role', 'status');
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
    else changed({ src, ...(hasAlt && altText !== '' ? { alt: altText } : {}), ...(point === null ? {} : { focalPoint: point }) });
  };

  // A picture cropped to the field's size shows the crop the build makes, around the focal point
  // of the image shown, as far as its edges allow.
  const placeCrop = () => {
    if (!crop || picture.naturalWidth === 0) return;
    const shownPoint = src === '' ? standInPoint : point;
    const natural = { width: picture.naturalWidth, height: picture.naturalHeight };
    const cut = cropOf(natural, crop.width / crop.height, shownPoint ?? undefined);
    const along = (start, size, whole) => (whole > size ? `${(start / (whole - size)) * 100}%` : '50%');
    picture.style.objectPosition = cut === null ? '' : `${along(cut.left, cut.width, natural.width)} ${along(cut.top, cut.height, natural.height)}`;
  };
  picture.addEventListener('load', placeCrop);

  // An uploaded file has a blob: address until the entry is saved. The name it gets is kept
  // here, so that the field shows it and not the address.
  const uploadedNames = new Map();
  // The file chosen, kept while the entry is unsaved, so that it can be converted again.
  let original = null;
  let working = false;

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
    if (move) move.hidden = !shown;
    placeCrop();
    // A saved entry's file is the entry. Before it is saved, another may be chosen.
    if (pick) {
      pick.hidden = shown && !unsaved;
      pick.textContent = say(unsaved ? 'image.pickOther' : 'image.pickFile');
    }
    // Changed only while the file chosen is in hand, which a saved entry's is not.
    if (lossless) {
      const inHand = original !== null && uploadedNames.has(src);
      lossless.row.hidden = inHand ? false : !shown || /\.svg$/i.test(uploadedNames.get(src) ?? src);
      lossless.input.disabled = !inHand || working;
      if (!inHand) lossless.input.checked = savedLossless;
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
    void pictureAddress(library, showingSrc).then(showing);
  };

  choose?.addEventListener('click', async () => {
    if (!library) return;
    const chosen = await chooseImage({ library, smallestWidth });
    if (!chosen) return;
    src = chosen.src;
    altText = hasAlt ? chosen.alt ?? '' : '';
    point = hasPoint ? heldFocalPoint(chosen.focalPoint) : null;
    note.textContent = '';
    render();
    emit();
  });

  remove?.addEventListener('click', () => {
    src = '';
    altText = '';
    point = null;
    render();
    emit();
  });

  move?.addEventListener('click', async () => {
    const address = await pictureAddress(library, src);
    const answer = await moveFocalPoint({ address, focalPoint: point, frames });
    move.focus();
    if (answer === null || samePoint(answer.focalPoint, point)) return;
    point = answer.focalPoint;
    placeCrop();
    emit();
  });

  altInput?.addEventListener('input', () => {
    altText = altInput.value;
    emit();
  });

  // The file converted as `losslessly` says, and added under the name the library's upload gives,
  // the same file twice being one original. Whether it was.
  const added = async (file, losslessly) => {
    note.textContent = '';
    working = true;
    pick.disabled = true;
    lossless.input.disabled = true;
    status.textContent = say('body.converting');
    try {
      const prepared = await preparedUpload(file, { library, lossless: losslessly, smallestWidth });
      if (prepared.problem) {
        note.textContent = wordsShown(prepared.problem);
        return false;
      }
      const bytes = new Uint8Array(await prepared.file.arrayBuffer());
      const named = `${stemOf(file.name)}-${hex(await globalThis.crypto.subtle.digest('SHA-256', bytes)).slice(0, 10)}.${EXTENSIONS[kindOf(bytes)]}`;
      src = (await exists(`${MEDIA_FOLDER}/${named}`)) ? `/${MEDIA_FOLDER}/${named}` : await addFile(new File([bytes], named, { type: prepared.file.type }));
      uploadedNames.set(src, named);
      chosenLossless(losslessly);
      emit();
      return true;
    } catch (error) {
      console.warn(`The file was not added: ${error.message}`);
      note.textContent = say(error.converting ? 'body.convertFailed' : 'image.notAdded');
      return false;
    } finally {
      working = false;
      pick.disabled = false;
      status.textContent = '';
      render();
    }
  };

  pick?.addEventListener('click', () => input.click());
  input?.addEventListener('change', async () => {
    const [file] = input.files;
    input.value = '';
    if (!file) return;
    note.textContent = '';
    const problem = await uploadProblem(file).catch(() => null);
    if (problem !== null) {
      note.textContent = wordsShown(problem);
      return;
    }
    const kind = await kindOfFile(file);
    if (!isConverted(kind) && kind !== 'svg') {
      note.textContent = say('image.notImage');
      return;
    }
    original = isConverted(kind) ? file : null;
    lossless.input.checked = losslessByDefault(kind);
    const byName = isConverted(kind) ? await displayWidthOfFile(file) : null;
    if (await added(file, lossless.input.checked)) chosenDisplayWidth(byName);
  });
  lossless?.input.addEventListener('change', async () => {
    if (original === null) return;
    const wanted = lossless.input.checked;
    if (!(await added(original, wanted))) lossless.input.checked = !wanted;
  });

  ({ src, alt: altText, point } = read(value));
  render();

  return {
    setLossless(next) {
      if (savedLossless === (next === true)) return;
      savedLossless = next === true;
      render();
    },
    // The main image the field falls back to, its address, and its focal point.
    setStandIn(next, nextPoint = null) {
      const given = typeof next === 'string' ? next : '';
      const givenPoint = heldFocalPoint(nextPoint);
      if (given === standIn && samePoint(givenPoint, standInPoint)) return;
      standIn = given;
      standInPoint = givenPoint;
      if (src === '') render();
    },
    setValue(next) {
      const given = read(next);
      if (given.src === src && given.alt === altText && samePoint(given.point, point)) return;
      ({ src, alt: altText, point } = given);
      render();
    },
    destroy() {
      shownFor += 1;
      root.remove();
    },
  };
}
