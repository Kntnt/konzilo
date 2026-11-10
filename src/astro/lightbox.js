// The lightbox (ADR 0056): each image of a post's body opens over the page, in the one dialog all
// that is shown over a page stands in, and a gallery steps through its images. What is written is
// HTML the browser can run by itself: a button around each image, and after its figure a dialog
// with the images in a strip that snaps, so that the arrow keys step and a finger swipes. The
// page's script (lightboxClient) does what HTML cannot.
//
// It goes through a body's HTML as `Body.astro` renders it, so a page has it and the body's own
// HTML does not. Only what it adds is new: every other byte stays as it was.

import { textsOf } from '../catalogues.js';
import { endOf, nextTag } from './directives.js';

// What a visitor reads of the lightbox, in the catalogues (ADR 0066) under `site.lightbox.`.
const TEXTS = 'site.lightbox.';

const ICON = (path) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
const CLOSE = ICON('M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z');
const PREVIOUS = ICON('M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z');
const NEXT = ICON('M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z');

const quoted = (text) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const word = (text, values = {}) => text.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');

// What stands directly in an element, each as { tag, close }.
function childrenOf(html, { tag: open, close: end }) {
  const found = [];
  let at = open.end;
  for (;;) {
    const tag = nextTag(html, at);
    if (!tag || tag.start >= end.start) return found;
    const close = tag.void ? { start: tag.end, end: tag.end } : endOf(html, tag);
    if (!tag.closing) found.push({ tag, close });
    at = tag.closing ? tag.end : close.end;
  }
}

// A figure's image and caption, or null where it holds no image of its own.
function pictureOf(html, figure) {
  const children = childrenOf(html, figure);
  const image = children.find(({ tag }) => tag.name === 'img');
  return image ? { image: image.tag, caption: children.find(({ tag }) => tag.name === 'figcaption') ?? null } : null;
}

// The figures in a part of a body that the lightbox takes, each with what it shows, a gallery as
// one. A figure of a kind of its own, an embed say, is none of its concern.
function figuresIn(html) {
  const found = [];
  let at = 0;
  for (;;) {
    const tag = nextTag(html, at);
    if (!tag) return found;
    at = tag.end;
    if (tag.name !== 'figure' || tag.closing) continue;
    const figure = { tag, close: endOf(html, tag) };
    at = figure.close.end;
    const classes = (tag.attributes.class ?? '').split(/\s+/);
    if (classes.includes('konzilo-embed')) continue;
    const pictures = classes.includes('konzilo-gallery')
      ? childrenOf(html, figure).filter((child) => child.tag.name === 'figure').map((child) => pictureOf(html, child)).filter(Boolean)
      : [pictureOf(html, figure)].filter(Boolean);
    if (pictures.length > 0) found.push({ end: figure.close.end, pictures });
  }
}

function slide(html, { image, caption }, at, all, texts) {
  const attributes = ['src', 'srcset', 'width', 'height', 'alt'].flatMap((name) => (image.attributes[name] === undefined ? [] : [`${name}="${quoted(image.attributes[name])}"`]));
  const words = caption ? `<figcaption>${html.slice(caption.tag.end, caption.close.start)}</figcaption>` : '';
  const place = all > 1 ? `<p class="konzilo-lightbox-place">${word(texts.place, { at, all })}</p>` : '';
  return `<li><figure><img ${attributes.join(' ')} sizes="100vw" loading="lazy" decoding="async">${words}${place}</figure></li>`;
}

function dialogFor(html, { pictures }, id, texts) {
  const several = pictures.length > 1;
  const steps = (button) => (several ? button : '');
  const slides = pictures.map((picture, index) => slide(html, picture, index + 1, pictures.length, texts)).join('');
  // The strip first, for a dialog gives the focus to the first thing that takes it, and that is
  // what puts the arrow keys to work. `autofocus` would say the same, and a browser complains of
  // it in a frame from elsewhere, as a preview is.
  return `<dialog class="konzilo-modal konzilo-lightbox" id="${id}" aria-label="${quoted(several ? texts.images : texts.image)}">`
    + `<ul class="konzilo-lightbox-strip" tabindex="0">${slides}</ul>`
    + `<button class="konzilo-modal-close" type="button" commandfor="${id}" command="close" aria-label="${quoted(texts.close)}">${CLOSE}</button>`
    + steps(`<button class="konzilo-lightbox-step konzilo-lightbox-previous" type="button" data-konzilo-step="-1" aria-label="${quoted(texts.previous)}">${PREVIOUS}</button>`)
    + steps(`<button class="konzilo-lightbox-step konzilo-lightbox-next" type="button" data-konzilo-step="1" aria-label="${quoted(texts.next)}">${NEXT}</button>`)
    + '</dialog>';
}

// A part of a body's HTML with its lightboxes. `next()` gives the number for the next dialog's id,
// which is unique on a page however many bodies it renders. `locale` is the page's language.
export function withLightboxes(html, { next, locale }) {
  if (!html.includes('<img')) return html;
  const found = figuresIn(html);
  if (found.length === 0) return html;
  const texts = textsOf(locale, TEXTS);
  const inserts = [];
  for (const figureFound of found) {
    const id = `konzilo-modal-${next()}`;
    figureFound.pictures.forEach(({ image }, index) => {
      const name = quoted(word(texts.open, { alt: image.attributes.alt ?? '' }));
      inserts.push([image.start, `<button class="konzilo-lightbox-open" type="button" commandfor="${id}" command="show-modal" data-konzilo-at="${index}" aria-label="${name}">`]);
      inserts.push([image.end, '</button>']);
    });
    inserts.push([figureFound.end, dialogFor(html, figureFound, id, texts)]);
  }
  inserts.sort(([one], [other]) => one - other);
  let out = '';
  let from = 0;
  for (const [at, text] of inserts) {
    out += html.slice(from, at) + text;
    from = at;
  }
  return out + html.slice(from);
}

// The page's script (ADR 0056), a function the integration writes into it, so it stands alone. It
// opens a dialog at the image clicked, steps by the arrow buttons, shows which way there is to step,
// and closes at a click on the bare overlay. It takes the opening from the browser, so that all
// browsers go the same way, and one too old to know `commandfor` too.
export function lightboxClient() {
  const stripOf = (dialog) => dialog.querySelector('.konzilo-lightbox-strip');
  const placeOf = (strip) => Math.round(strip.scrollLeft / strip.clientWidth);
  const showSteps = (dialog) => {
    const strip = stripOf(dialog);
    const at = placeOf(strip);
    const previous = dialog.querySelector('.konzilo-lightbox-previous');
    const next = dialog.querySelector('.konzilo-lightbox-next');
    if (!previous || !next) return;
    const leaving = [previous, next].find((step) => step === document.activeElement);
    previous.disabled = at <= 0;
    next.disabled = at >= strip.children.length - 1;
    if (leaving?.disabled) strip.focus();
  };

  document.addEventListener('click', (event) => {
    const { target } = event;
    const opener = target.closest?.('.konzilo-lightbox-open');
    if (opener) {
      const dialog = document.getElementById(opener.getAttribute('commandfor'));
      if (!dialog) return;
      event.preventDefault();
      dialog.showModal();
      const strip = stripOf(dialog);
      strip.scrollTo({ left: strip.clientWidth * Number(opener.dataset.konziloAt), behavior: 'instant' });
      showSteps(dialog);
      return;
    }
    const dialog = target.closest?.('.konzilo-lightbox');
    if (!dialog) return;
    const closer = target.closest('.konzilo-modal-close');
    if (closer) {
      event.preventDefault();
      dialog.close();
      return;
    }
    const step = target.closest('[data-konzilo-step]');
    if (step) {
      const strip = stripOf(dialog);
      strip.scrollBy({ left: strip.clientWidth * Number(step.dataset.konziloStep) });
      return;
    }
    if (!target.closest('img, figcaption, .konzilo-lightbox-place')) dialog.close();
  });

  for (const dialog of document.querySelectorAll('.konzilo-lightbox')) {
    stripOf(dialog).addEventListener('scroll', () => showSteps(dialog), { passive: true });
  }
}
