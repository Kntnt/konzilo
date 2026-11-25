// Each image the core draws from a master is served in fixed widths, its versions, which the build
// makes as WebP and writes in `srcset` with `w` descriptors, beside a `sizes` that says how wide
// the context it is drawn in draws it; a browser then loads the narrowest at least as wide as it
// draws the image, for the screen's density too (ADR 0022). The widths and sizes are the site's
// design's, by context, through konzilo({ images }), as `bodyStyles` and `tokens` are (ADR 0054),
// and a context the design leaves out has the core's.
//
// The contexts: a body's image, a gallery's, the lightbox's (which shows a body's images and a
// gallery's from the same `srcset`, so theirs hold its widths too), and a hero's and a card's,
// which a site's templates draw (imageVersions() in images.js). The core's widths are steps of one
// ladder, so that an image drawn in two contexts shares its versions, and the core's sizes are
// the site template's, for a site without a design package.

// The widest version the build makes of any image, whatever a context asks: the master's longest
// side, so that a hero across a wide, dense screen gets no more than the master holds.
export const WIDEST = 2520;

// The WebP quality of each version, chosen by measuring (ADR 0022). A lossless master's versions
// are lossless (image-service.js).
export const QUALITY = 75;

// The contexts the core draws images in, each with its widths and its sizes.
export const IMAGE_CONTEXTS = Object.freeze({
  body: Object.freeze({ widths: Object.freeze([480, 800, 1200, 1600]), sizes: '(min-width: 46rem) 46rem, 100vw' }),
  gallery: Object.freeze({ widths: Object.freeze([480, 800, 1200]), sizes: '(min-width: 46rem) 15rem, (min-width: 28rem) 50vw, 100vw' }),
  lightbox: Object.freeze({ widths: Object.freeze([1600, 2520]), sizes: '100vw' }),
  hero: Object.freeze({ widths: Object.freeze([800, 1200, 1600, 2000, 2520]), sizes: '100vw' }),
  card: Object.freeze({ widths: Object.freeze([480, 800, 1200]), sizes: '(min-width: 40rem) 23rem, 100vw' }),
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The contexts a site's konzilo({ images }) gives, each over the core's: `images` gives
// any of them, each its `widths`, whole numbers of pixels up to WIDEST, its `sizes`, or both,
// and one left out keeps the core's. What the core cannot use fails at once, naming it.
export function imageContexts(images) {
  if (images === undefined) return IMAGE_CONTEXTS;
  const fail = (what) => {
    throw new Error(`Konzilo: konzilo({ images }) ${what}`);
  };
  if (!isObject(images)) fail('must give each context the site draws images in by its name, such as { body: { widths: [480, 800], sizes: \'100vw\' } }');
  const contexts = {};
  for (const [name, given] of Object.entries(images)) {
    if (!Object.hasOwn(IMAGE_CONTEXTS, name)) fail(`names the context ${name}, which the core does not know: ${Object.keys(IMAGE_CONTEXTS).join(', ')}`);
    if (!isObject(given)) fail(`must give ${name} its widths, its sizes or both`);
    for (const key of Object.keys(given)) {
      if (key !== 'widths' && key !== 'sizes') fail(`gives ${name} ${key}, where a context has its widths and its sizes`);
    }
    const { widths, sizes } = given;
    if (widths !== undefined) {
      if (!Array.isArray(widths) || widths.length === 0 || !widths.every((width) => Number.isInteger(width) && width > 0)) fail(`must give ${name} its widths as a list of whole numbers of pixels`);
      const wider = widths.find((width) => width > WIDEST);
      if (wider !== undefined) fail(`gives ${name} a width of ${wider} px, wider than the widest version the core makes, ${WIDEST} px`);
    }
    if (sizes !== undefined && (typeof sizes !== 'string' || sizes.trim() === '')) fail(`must give ${name} its sizes as the text of a sizes attribute, such as '100vw'`);
    contexts[name] = {
      widths: widths === undefined ? IMAGE_CONTEXTS[name].widths : [...new Set(widths)].sort((a, b) => a - b),
      sizes: sizes === undefined ? IMAGE_CONTEXTS[name].sizes : sizes.trim(),
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
// that width (DISPLAY_WIDTH, image-service.js), its versions are as any other's, up to its
// master's, so that a dense screen gets its full pixels, and its `sizes` says it is drawn no
// wider (sizesNoWider()).
export function versionsInBody(contexts = IMAGE_CONTEXTS) {
  return {
    name: 'konzilo-image-versions',
    element: {
      filter: ['img'],
      visit(node, ctx) {
        const { src, width } = node.properties ?? {};
        if (typeof src !== 'string' || !ctx.data.astro?.localImagePaths.has(decodeURI(src))) return;
        const display = Number(width) > 0 ? Number(width) : null;
        if (display !== null) {
          ctx.setProperty(node, 'width', null);
          ctx.setProperty(node, DISPLAY_WIDTH, display);
        }
        if (/\.svg$/i.test(src.split(/[?#]/)[0])) return;
        const figure = ctx.parent(node);
        const inGallery = isTag(figure, 'figure') && isTag(ctx.parent(figure), 'figure') && (ctx.parent(figure).properties?.className ?? []).includes('konzilo-gallery');
        const context = contexts[inGallery ? 'gallery' : 'body'];
        const widths = [...new Set([...context.widths, ...contexts.lightbox.widths])].sort((a, b) => a - b);
        ctx.setProperty(node, 'widths', widths);
        ctx.setProperty(node, 'sizes', display === null ? context.sizes : sizesNoWider(context.sizes, display));
      },
    },
  };
}

// The option by which an image is asked to be written at most so wide, in pixels, its display
// width, with its versions and its `src` as they would be without it (image-service.js).
export const DISPLAY_WIDTH = 'konziloDisplayWidth';

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
