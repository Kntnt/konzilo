// An image's focal point (ADR 0022, ADR 0055): the place in it that a crop to another aspect ratio
// is centred on, as two fractions, of its width from the left and of its height from the top, so
// that it holds for the original, the master and every version alike, whatever their pixels. An
// image without one is cropped around its middle. The intake, the build and the editor's frames
// read and crop by this one rule, and an image's title writes it as body.js says (focusText()).

import { toThousandth } from './body.js';

// Where a crop is centred on an image without a focal point.
export const MIDDLE = Object.freeze({ x: 0.5, y: 0.5 });

const isFraction = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

// A focal point as a source or a content file gives one, `{ x, y }`: the point to the thousandth,
// null where none is given, and { wrong: true } where what is given is no such point.
export function focalPointOf(given) {
  if (given === undefined || given === null || given === '') return null;
  if (typeof given !== 'object' || Array.isArray(given)) return { wrong: true };
  const keys = Object.keys(given);
  if (keys.length !== 2 || !isFraction(given.x) || !isFraction(given.y)) return { wrong: true };
  return { x: toThousandth(given.x), y: toThousandth(given.y) };
}

// An aspect ratio as a site's design names one, a width and a height, each a positive number, with
// a colon between, `16:9` or `1.91:1`: { text, value }, `value` the width over the height, or null
// for anything else.
export function ratioOf(given) {
  if (typeof given !== 'string') return null;
  const text = given.trim();
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(text);
  if (match === null) return null;
  const [width, height] = [Number(match[1]), Number(match[2])];
  return width > 0 && height > 0 ? { text, value: width / height } : null;
}

const within = (value, least, most) => Math.min(most, Math.max(least, value));

// The crop of an image `width` × `height` pixels to the aspect ratio `ratio`, its width over its
// height, around the focal point `focus`, or its middle without one: { left, top, width, height } in
// whole pixels, as large as fits in the image, and centred on the point as far as the image's edges
// allow. Null where the image is in that ratio already, to the pixel, so that nothing is cropped.
export function cropOf({ width, height }, ratio, focus = MIDDLE) {
  const wider = width / height > ratio;
  const across = within(wider ? Math.round(height * ratio) : width, 1, width);
  const down = within(wider ? height : Math.round(width / ratio), 1, height);
  if (across === width && down === height) return null;
  const { x, y } = focus ?? MIDDLE;
  return {
    left: within(Math.round(x * width - across / 2), 0, width - across),
    top: within(Math.round(y * height - down / 2), 0, height - down),
    width: across,
    height: down,
  };
}
