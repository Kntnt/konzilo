// Each image the core draws from a master is served in fixed widths, its versions, which the build
// makes as WebP and writes in `srcset` with `w` descriptors, beside a `sizes` that says how wide
// the context it is drawn in draws it; a browser then loads the narrowest at least as wide as it
// draws the image, for the screen's density too (ADR 0022). The widths and sizes are the site's
// design's, by context, through konzilo({ images }), as `bodyStyles` and `tokens` are (ADR 0054),
// and so is the aspect ratio a context draws its images in, to which an image of another ratio is
// cropped around its focal point; a context the design leaves out has the core's.
//
// The contexts: a body's image, a gallery's, the lightbox's (which shows a body's images and a
// gallery's from the same `srcset`, so theirs hold its widths too, unless the context crops them),
// and a hero's and a card's, which a site's templates draw (imageVersions() in images.js). The
// core's widths are steps of one ladder, so that an image drawn in two contexts shares its
// versions, the core's sizes are the site template's, for a site without a design package, and
// the core crops nothing.

import { focusIn, focusText } from '../format/body.js';
import { MIDDLE, ratioOf } from '../format/focal-point.js';

// The widest version the build makes of any image, whatever a context asks: the master's longest
// side, so that a hero across a wide, dense screen gets no more than the master holds.
export const WIDEST = 2520;

// The WebP quality of each version, chosen by measuring (ADR 0022). A lossless master's versions
// are lossless (image-service.js).
export const QUALITY = 75;

// The contexts the core draws images in, each with its widths, its sizes and its aspect ratio,
// which is none in the core's, the image's own, so that nothing is cropped.
export const IMAGE_CONTEXTS = Object.freeze({
  body: Object.freeze({ widths: Object.freeze([480, 800, 1200, 1600]), sizes: '(min-width: 46rem) 46rem, 100vw', ratio: null }),
  gallery: Object.freeze({ widths: Object.freeze([480, 800, 1200]), sizes: '(min-width: 46rem) 15rem, (min-width: 28rem) 50vw, 100vw', ratio: null }),
  lightbox: Object.freeze({ widths: Object.freeze([1600, 2520]), sizes: '100vw', ratio: null }),
  hero: Object.freeze({ widths: Object.freeze([800, 1200, 1600, 2000, 2520]), sizes: '100vw', ratio: null }),
  card: Object.freeze({ widths: Object.freeze([480, 800, 1200]), sizes: '(min-width: 40rem) 23rem, 100vw', ratio: null }),
});

// The context that shows each image whole, and so has no aspect ratio of its own.
const WHOLE = 'lightbox';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The contexts a site's konzilo({ images }) gives, each over the core's: `images` gives
// any of them, each its `widths`, whole numbers of pixels up to WIDEST, its `sizes`, its `ratio`,
// the aspect ratio it draws an image in, a width and a height with a colon between, `16:9`, which
// each version of an image in another ratio is cropped to around its focal point, or any of
// these, and one left out keeps the core's. The lightbox shows each image whole, and takes no
// ratio. What the core cannot use fails at once, naming it.
export function imageContexts(images) {
  if (images === undefined) return IMAGE_CONTEXTS;
  const fail = (what) => {
    throw new Error(`Konzilo: konzilo({ images }) ${what}`);
  };
  if (!isObject(images)) fail('must give each context the site draws images in by its name, such as { body: { widths: [480, 800], sizes: \'100vw\' } }');
  const contexts = {};
  for (const [name, given] of Object.entries(images)) {
    if (!Object.hasOwn(IMAGE_CONTEXTS, name)) fail(`names the context ${name}, which the core does not know: ${Object.keys(IMAGE_CONTEXTS).join(', ')}`);
    if (!isObject(given)) fail(`must give ${name} its widths, its sizes, its aspect ratio or any of these`);
    for (const key of Object.keys(given)) {
      if (!['widths', 'sizes', 'ratio'].includes(key)) fail(`gives ${name} ${key}, where a context has its widths, its sizes and its aspect ratio`);
    }
    const { widths, sizes, ratio } = given;
    if (widths !== undefined) {
      if (!Array.isArray(widths) || widths.length === 0 || !widths.every((width) => Number.isInteger(width) && width > 0)) fail(`must give ${name} its widths as a list of whole numbers of pixels`);
      const wider = widths.find((width) => width > WIDEST);
      if (wider !== undefined) fail(`gives ${name} a width of ${wider} px, wider than the widest version the core makes, ${WIDEST} px`);
    }
    if (sizes !== undefined && (typeof sizes !== 'string' || sizes.trim() === '')) fail(`must give ${name} its sizes as the text of a sizes attribute, such as '100vw'`);
    if (ratio !== undefined && name === WHOLE) fail(`gives ${name} an aspect ratio, where the lightbox shows each image whole`);
    if (ratio !== undefined && ratioOf(ratio) === null) fail(`must give ${name} its aspect ratio as a width and a height with a colon between, such as '16:9', not ${ratio}`);
    contexts[name] = {
      widths: widths === undefined ? IMAGE_CONTEXTS[name].widths : [...new Set(widths)].sort((a, b) => a - b),
      sizes: sizes === undefined ? IMAGE_CONTEXTS[name].sizes : sizes.trim(),
      ratio: ratio === undefined ? IMAGE_CONTEXTS[name].ratio : ratioOf(ratio).text,
    };
  }
  return { ...IMAGE_CONTEXTS, ...contexts };
}

const isTag = (node, tagName) => node?.type === 'element' && node.tagName === tagName;

// Sätteri's HTML tree plugin that gives each image of a body, one Astro makes from a master, the
// widths and sizes of the context it is drawn in, a gallery's or else a body's, with the
// lightbox's widths too, which Astro's own plugin after it hands to its image service with the
// rest of the image's properties. It runs after figures.js, which makes a gallery its figure.
// An SVG is kept as it is (ADR 0023), in no widths.
//
// An image standing alone with a display width of its own, which figures.js gives its `width`,
// is drawn at most that wide: the image service is asked to write its `width` and `height` at
// that width (DISPLAY_WIDTH_OPTION, image-service.js), its versions are as any other's, up to its
// master's, so that a dense screen gets its full pixels, and its `sizes` says it is drawn no
// wider (sizesNoWider()).
//
// A context with an aspect ratio of its own has its images cropped to it, around the focal point
// figures.js gives the node as its data, or around the middle without one (cropOptions()). The
// lightbox shows each image whole, so such an image's versions are its context's alone, and a
// second image of the same master stands after it in its figure, hidden, in the lightbox's widths,
// which Astro makes as it makes any image, and the lightbox takes out of the figure as its own
// (WHOLE_ATTRIBUTE, lightbox.js).
export function versionsInBody(contexts = IMAGE_CONTEXTS) {
  return {
    name: 'konzilo-image-versions',
    element: {
      filter: ['img'],
      visit(node, ctx) {
        const { src, width, alt } = node.properties ?? {};
        if (typeof src !== 'string' || !ctx.data.astro?.localImagePaths.has(decodeURI(src))) return;
        if (node.properties[WHOLE_ATTRIBUTE] !== undefined) return;
        const display = Number(width) > 0 ? Number(width) : null;
        if (display !== null) {
          ctx.setProperty(node, 'width', null);
          ctx.setProperty(node, DISPLAY_WIDTH_OPTION, display);
        }
        if (/\.svg$/i.test(src.split(/[?#]/)[0])) return;
        const figure = ctx.parent(node);
        const inGallery = isTag(figure, 'figure') && isTag(ctx.parent(figure), 'figure') && (ctx.parent(figure).properties?.className ?? []).includes('konzilo-gallery');
        const context = contexts[inGallery ? 'gallery' : 'body'];
        const sizes = display === null ? context.sizes : sizesNoWider(context.sizes, display);
        if (context.ratio === null) {
          ctx.setProperty(node, 'widths', [...new Set([...context.widths, ...contexts.lightbox.widths])].sort((a, b) => a - b));
          ctx.setProperty(node, 'sizes', sizes);
          return;
        }
        ctx.setProperty(node, 'widths', [...context.widths]);
        ctx.setProperty(node, 'sizes', sizes);
        for (const [key, value] of Object.entries(cropOptions(context.ratio, node.data?.focus ?? null))) ctx.setProperty(node, key, value);
        if (isTag(figure, 'figure')) {
          ctx.insertAfter(node, { type: 'element', tagName: 'img', properties: { src, alt, widths: [...contexts.lightbox.widths], sizes: contexts.lightbox.sizes, hidden: '', [WHOLE_ATTRIBUTE]: '' }, children: [] });
        }
      },
    },
  };
}

// The options by which an image is asked to be cropped to a context's aspect ratio, `ratio` as
// the design names it, `16:9`, around its focal point `focus`, { x, y }, or its middle where it has
// none (image-service.js): none where the context has no ratio of its own. Each a number or a
// text, since Sätteri keeps no other kind of property on an image of a body.
export function cropOptions(ratio, focus = null) {
  const read = ratioOf(ratio);
  if (read === null) return {};
  return { [RATIO_OPTION]: read.value, [FOCUS_OPTION]: focusText(focus ?? MIDDLE) };
}

// The options cropOptions() gives: the ratio, its width over its height, and the focal point as an
// image's title writes it.
export const RATIO_OPTION = 'konziloRatio';
export const FOCUS_OPTION = 'konziloFocus';

// What a crop around a focal point asks of Astro's image service once its options are read: its
// `position`, which Astro hashes into the name of each version and carries in the address the dev
// server makes it at, as it does every option of its own, so that a crop around another point is
// another file. `focus` { x, y }.
const POSITION = 'konzilo-focus ';
export const focusPosition = (focus) => `${POSITION}${focusText(focus)}`;

// The focal point a `position` names, { x, y }, or null where it names none.
export const focusOfPosition = (position) => (typeof position === 'string' && position.startsWith(POSITION) ? focusIn(position.slice(POSITION.length)) : null);

// The attribute of the hidden image in a figure that the lightbox shows in place of a cropped one.
// The image is given it as a property by this name, since Astro writes each property of an image
// it makes as an attribute of the name it has.
export const WHOLE_ATTRIBUTE = 'data-konzilo-whole';

// The option by which an image is asked to be written at most so wide, in pixels, its display
// width, with its versions and its `src` as they would be without it (image-service.js).
export const DISPLAY_WIDTH_OPTION = 'konziloDisplayWidth';

// The parts of a `sizes`, or of one of its sizes, split where `by` stands outside any
// parentheses, as in `(min-width: 40rem) calc(50vw - 1rem)`.
function splitOutside(text, by) {
  const parts = [''];
  let depth = 0;
  for (const character of text) {
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && by.test(character)) parts.push('');
    else parts[parts.length - 1] += character;
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

// A `sizes` that says no image is drawn wider than `most` pixels: each size of it no wider, by
// `min()`, its media condition as it was. `auto`, the drawn width itself, is that already.
export function sizesNoWider(sizes, most) {
  return splitOutside(sizes, /,/).map((size) => {
    const words = splitOutside(size, /\s/);
    const value = words.at(-1);
    if (value.toLowerCase() === 'auto') return size;
    const condition = size.slice(0, size.length - value.length).trim();
    return `${condition === '' ? '' : `${condition} `}min(${value}, ${most}px)`;
  }).join(', ');
}

// How near below the widest version of an image another may be and still be made: a width within
// a tenth below it is so near in pixels, and so in bytes, that a browser choosing between the two
// gains nothing, so a master 1300 px wide is made in 1300 and not in 1200 as well (ADR 0022).
const NEAR_DUPLICATE = 0.9;

// The widths an image of a master `own` pixels wide is made in, asked for in `widths`: each up
// to the master's width and WIDEST, and in place of those wider, the master's own width, or
// WIDEST, without a width within a tenth below it (NEAR_DUPLICATE).

export function versionWidths(widths, own) {
  const widest = Math.min(own, WIDEST);
  const sorted = [...new Set(widths.map(Math.round))].sort((a, b) => a - b);
  const within = sorted.filter((width) => width <= widest);
  if (within.length === sorted.length) return within;
  return [...within.filter((width) => width < widest * NEAR_DUPLICATE), widest];
}
