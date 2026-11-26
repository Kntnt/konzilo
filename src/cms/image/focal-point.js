// An image's focal point as an editor places it (ADR 0022, ADR 0055): the image, with the point on
// it and a frame for each aspect ratio the site crops images to (frames.js), each showing what its
// crop keeps, which follow the point as it moves. A click or a drag on the image places the point,
// and so do the arrow keys on the point itself, a hundredth of a side at a step, a tenth with
// Shift. *Clear the focal point*, or Delete on the point, takes it away, and every crop then keeps
// the middle, where the point is drawn, faint. The point says where it stands to a screen reader
// as a slider says its value, and a line for a screen reader says it once a click or a drag has
// placed it.
//
// The point is held as the format holds it, { x, y }, fractions of the image's width from the left
// and of its height from the top, to the thousandth, or null; `changed(point)` hears of each change.
// The frames are drawn by the image's own proportions, as the build crops its master.

import { cropOf, heldFocalPoint, MIDDLE, toThousandth } from '../../format/focal-point.js';
import { button, dialogOf, made } from '../body/dialog.js';
import { say } from '../interface-language.js';
import '../body/field.css';
import './field.css';

const STEP = 0.01;
const LONG_STEP = 0.1;

const within = (value) => Math.min(1, Math.max(0, value));
const percent = (fraction) => `${fraction * 100}%`;
const whole = (fraction) => Math.round(fraction * 100);

// How many pickers have been made, which names each one's hint.
let pickers = 0;

// The contexts an image is cropped in, by the names a frame calls them by.
const CONTEXTS = {
  body: 'image.context.body',
  gallery: 'image.context.gallery',
  hero: 'image.context.hero',
  card: 'image.context.card',
  sharing: 'image.context.sharing',
};

// What a frame is called beside it: its contexts, then its ratio, "card, gallery 1:1".
const frameLabel = ({ text, contexts }) => say('image.frame', { contexts: contexts.filter((context) => Object.hasOwn(CONTEXTS, context)).map((context) => say(CONTEXTS[context])).join(', '), ratio: text });

// Where a point stands, in words, as its slider says it.
const pointWords = (point) => (point === null ? say('image.focalPointNone') : say('image.focalPointAt', { x: whole(point.x), y: whole(point.y) }));

// The picker in `parent`, for the picture at `address`, which may come later (setAddress()).
export function focalPointPicker(parent, { address = null, focalPoint = null, frames = [], changed = () => {} } = {}) {
  let point = heldFocalPoint(focalPoint);
  let natural = null;
  pickers += 1;

  const root = made('div', 'konzilo-focal', parent);
  const picture = made('div', 'konzilo-focal-picture', root);
  const image = made('img', '', picture);
  image.alt = '';
  image.draggable = false;
  const boxes = frames.map((frame) => {
    const box = made('span', 'konzilo-focal-frame', picture);
    box.dataset.ratio = frame.text;
    made('span', 'konzilo-focal-frame-label', box).textContent = frameLabel(frame);
    box.hidden = true;
    return { frame, box };
  });
  const dot = made('span', 'konzilo-focal-point', picture);
  dot.tabIndex = 0;
  dot.setAttribute('role', 'slider');
  dot.setAttribute('aria-label', say('image.focalPoint'));
  dot.setAttribute('aria-valuemin', '0');
  dot.setAttribute('aria-valuemax', '100');
  const empty = made('p', 'konzilo-focal-empty', root);
  empty.textContent = say('image.cannotShow');
  const hint = made('p', 'konzilo-focal-hint', root);
  hint.id = `konzilo-focal-hint-${pickers}`;
  hint.textContent = say('image.focalPointHint');
  dot.setAttribute('aria-describedby', hint.id);
  const clear = button('konzilo-focal-clear', say('image.focalPointClear'), root);
  const told = made('p', 'konzilo-focal-told', root);
  told.setAttribute('role', 'status');

  const draw = () => {
    const at = point ?? MIDDLE;
    dot.style.left = percent(at.x);
    dot.style.top = percent(at.y);
    dot.classList.toggle('konzilo-focal-none', point === null);
    dot.setAttribute('aria-valuenow', String(whole(at.x)));
    dot.setAttribute('aria-valuetext', pointWords(point));
    clear.disabled = point === null;
    for (const { frame, box } of boxes) {
      box.hidden = natural === null;
      if (natural === null) continue;
      const crop = cropOf(natural, frame.ratio, at) ?? { left: 0, top: 0, ...natural };
      Object.assign(box.style, { left: percent(crop.left / natural.width), top: percent(crop.top / natural.height), width: percent(crop.width / natural.width), height: percent(crop.height / natural.height) });
    }
  };

  const place = (next) => {
    point = next === null ? null : { x: toThousandth(within(next.x)), y: toThousandth(within(next.y)) };
    draw();
    changed(point);
  };

  const show = (given) => {
    natural = null;
    picture.hidden = given === null;
    empty.hidden = given !== null;
    clear.hidden = given === null;
    if (given === null) image.removeAttribute('src');
    else image.src = given;
    draw();
  };
  image.addEventListener('load', () => {
    natural = image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null;
    draw();
  });

  // A click or a drag anywhere on the picture places the point under the pointer.
  let dragging = null;
  const placeAt = ({ clientX, clientY }) => {
    const { left, top, width, height } = image.getBoundingClientRect();
    if (width > 0 && height > 0) place({ x: (clientX - left) / width, y: (clientY - top) / height });
  };
  picture.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = event.pointerId;
    picture.setPointerCapture?.(event.pointerId);
    placeAt(event);
    dot.focus({ preventScroll: true });
  });
  picture.addEventListener('pointermove', (event) => {
    if (event.pointerId === dragging) placeAt(event);
  });
  const letGo = (event) => {
    if (event.pointerId !== dragging) return;
    dragging = null;
    told.textContent = pointWords(point);
  };
  picture.addEventListener('pointerup', letGo);
  picture.addEventListener('pointercancel', letGo);

  const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  dot.addEventListener('keydown', (event) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      place(null);
      return;
    }
    const way = KEYS[event.key];
    if (!way) return;
    event.preventDefault();
    const step = event.shiftKey ? LONG_STEP : STEP;
    const at = point ?? MIDDLE;
    place({ x: at.x + way[0] * step, y: at.y + way[1] * step });
  });

  clear.addEventListener('click', () => {
    place(null);
    told.textContent = pointWords(null);
  });

  show(address);

  return {
    root,
    // The point as it stands, { x, y }, or null.
    read: () => point,
    // A point from outside, which no one is told of.
    set(next) {
      point = heldFocalPoint(next);
      draw();
    },
    setAddress: show,
    focus: () => dot.focus(),
    destroy: () => root.remove(),
  };
}

// The dialog in which a post moves the focal point of an image a field holds (field.js): the
// picker, and *Done* or *Cancel*. It gives { focalPoint }, the point or null, once it is done, and
// null where it was left, with nothing changed.
export function moveFocalPoint({ address, focalPoint = null, frames = [], root = document.body }) {
  return new Promise((resolve) => {
    const { dialog, body } = dialogOf(say('image.focalPointEdit'));
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
    const picker = focalPointPicker(body, { address, focalPoint, frames });
    const actions = made('div', 'konzilo-dialog-actions', body);
    button('', say('body.cancel'), actions).addEventListener('click', () => finish(null));
    button('konzilo-dialog-accept', say('body.done'), actions).addEventListener('click', () => finish({ focalPoint: picker.read() }));
    root.append(dialog);
    dialog.showModal();
    picker.focus();
  });
}
