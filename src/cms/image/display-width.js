// An image library entry's *Display width* (ADR 0055): *Fill the column*, as an image is drawn by
// default, or *At most* a number of pixels, the widest the image is drawn where it stands alone in
// a body, for a figure saved at twice the size it is meant to be read at. The entry's own form and
// the chooser's upload draw it alike, and a file whose name says it is such a figure fills it in.

import { DISPLAY_WIDTH_MOST, isDisplayWidth } from '../../format/body.js';
import { measured } from '../body/chooser-check.js';
import { made } from '../body/dialog.js';
import { say, sayParts } from '../interface-language.js';

// The scale a file's name says it was saved at, 2 or 3, for a name that ends in `@2x` or `@3x`
// before its extension, or null for any other.
export function scaleInName(name) {
  const match = /@([23])x$/i.exec(String(name).replace(/\.[^./@]*$/, ''));
  return match === null ? null : Number(match[1]);
}

// The display width a file's name gives an image `width` pixels wide: half of it for a name that
// ends in `@2x` before its extension, a third for `@3x`, and null for any other, which fills the
// column.
export function displayWidthByName(name, width) {
  const scale = scaleInName(name);
  if (scale === null || !(width > 0)) return null;
  return Math.min(DISPLAY_WIDTH_MOST, Math.max(1, Math.round(width / scale)));
}

// The display width a raster file's name gives it, by its pixel width as the browser decodes it,
// which is measured only where its name says it is such a figure; null for any other.
export async function displayWidthOfFile(file, measure = measured) {
  if (scaleInName(file.name) === null) return null;
  const size = await measure(file).catch(() => null);
  return displayWidthByName(file.name, size?.width);
}

let boxes = 0;

// The choice, under its own name for a screen reader, with what it does under it: { row, read(),
// set(width), check(), first }, `first` its first radio button, which a form's label names. `read()` gives { width }, null where it fills the column, or { wrong }
// where *At most* is chosen without a width it can take. `changed` is told each change an editor
// makes. `label`: whether the choice shows its name, which a form that names it does not.
export function displayWidthBox(parent, { changed = () => {}, label = true, className = 'konzilo-dialog-check' } = {}) {
  const n = (boxes += 1);
  const row = made('fieldset', `${className} konzilo-display-width`, parent);
  const legend = made('legend', label ? '' : 'konzilo-hidden', row);
  legend.textContent = say('body.displayWidth');
  // A choice, its radio button and its words, as the catalogue's text gives them, with any
  // control it places among them where the language places it (ADR 0066).
  const choice = (parts) => {
    const line = made('label', 'konzilo-display-width-choice', row);
    const input = made('input', '', line);
    input.type = 'radio';
    input.name = `konzilo-display-width-${n}`;
    for (const part of parts) {
      if (typeof part !== 'string') line.append(part);
      else if (part.trim() !== '') made('span', '', line).textContent = part.trim();
    }
    return { line, input };
  };
  const pixels = made('input', 'konzilo-display-width-pixels');
  pixels.type = 'number';
  pixels.inputMode = 'numeric';
  pixels.min = '1';
  pixels.max = String(DISPLAY_WIDTH_MOST);
  pixels.step = '1';
  pixels.setAttribute('aria-label', say('body.displayWidthPixels'));
  const filling = choice([say('body.displayWidthFill')]);
  const most = choice(sayParts('body.displayWidthMost', { pixels }));
  const hint = made('p', 'konzilo-dialog-hint', row);
  hint.id = `konzilo-display-width-hint-${n}`;
  hint.textContent = say('body.displayWidthHint');
  const note = made('p', 'konzilo-dialog-note', row);
  note.id = `konzilo-display-width-note-${n}`;
  note.setAttribute('role', 'alert');
  for (const input of [filling.input, most.input, pixels]) input.setAttribute('aria-describedby', hint.id);

  const read = () => {
    if (!most.input.checked) return null;
    const width = /^\d+$/.test(pixels.value.trim()) ? Number(pixels.value.trim()) : NaN;
    return isDisplayWidth(width) ? { width } : { wrong: pixels.value };
  };
  // What is shown of the choice: the pixels only for *At most*, and why it cannot be taken.
  const shown = ({ telling = false } = {}) => {
    pixels.disabled = !most.input.checked;
    const now = read();
    const wrong = now?.wrong !== undefined && (telling || pixels.value.trim() !== '');
    note.textContent = wrong ? say('body.displayWidthWrong', { most: DISPLAY_WIDTH_MOST }) : '';
    if (wrong) {
      pixels.setAttribute('aria-invalid', 'true');
      pixels.setAttribute('aria-describedby', `${hint.id} ${note.id}`);
    } else {
      pixels.removeAttribute('aria-invalid');
      pixels.setAttribute('aria-describedby', hint.id);
    }
  };
  const set = (width) => {
    const given = isDisplayWidth(width) ? width : null;
    filling.input.checked = given === null;
    most.input.checked = given !== null;
    if (given !== null) pixels.value = String(given);
    shown();
  };
  const tell = () => {
    shown();
    changed(read());
  };
  filling.input.addEventListener('change', tell);
  most.input.addEventListener('change', tell);
  pixels.addEventListener('input', tell);
  set(null);

  return {
    row,
    read,
    set,
    // Says why the choice cannot be taken, where it cannot, and gives the focus to its pixels.
    check() {
      shown({ telling: true });
      if (read()?.wrong === undefined) return true;
      pixels.focus();
      return false;
    },
    get first() {
      return filling.input;
    },
  };
}
