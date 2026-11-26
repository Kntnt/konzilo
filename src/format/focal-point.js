// An image's focal point (ADR 0022, ADR 0055): the place in it that a crop to another aspect ratio
// is centred on, as two fractions, of its width from the left and of its height from the top, so
// that it holds for the original, the master and every version alike, whatever their pixels. An
// image without one is cropped around its middle. The intake, the build and the editor's frames
// read and crop by this one rule, and an image's title writes it after `focus=` as
// focalPointText() says.

// Where a crop is centred on an image without a focal point.
export const MIDDLE = Object.freeze({ x: 0.5, y: 0.5 });

// A fraction of an image's side to the thousandth, as fine as a focal point is held: a pixel and a
// half of the widest master, which no eye tells apart in a crop.
export const toThousandth = (fraction) => Math.round(fraction * 1000) / 1000;

// A fraction as an image's title writes it: 0, 1, or 0 and a point and digits.
const FRACTION = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/;

// A focal point as an image's title writes it after `focus=`, its x and its y, fractions of its
// width from the left and of its height from the top, with a comma between, `0.25,0.4`: the one
// writing of it, which focalPointIn() reads.
export const focalPointText = ({ x, y }) => `${toThousandth(x)},${toThousandth(y)}`;

// A focal point, { x, y }, from what an image's title writes after `focus=`, to the thousandth, or
// null where that is no such point.
export function focalPointIn(text) {
  const parts = typeof text === 'string' ? text.split(',') : [];
  if (parts.length !== 2 || !parts.every((part) => FRACTION.test(part))) return null;
  const [x, y] = parts.map(Number);
  return { x: toThousandth(x), y: toThousandth(y) };
}

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

// A focal point as a value holds it, { x, y }, or null for none or what is no such point.
export function heldFocalPoint(given) {
  const read = focalPointOf(given);
  return read === null || read.wrong ? null : read;
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
// height, around the focal point `point`, or its middle without one: { left, top, width, height } in
// whole pixels, as large as fits in the image, and centred on the point as far as the image's edges
// allow. Null where the image is in that ratio already, to the pixel, so that nothing is cropped.
export function cropOf({ width, height }, ratio, point = MIDDLE) {
  const wider = width / height > ratio;
  const across = within(wider ? Math.round(height * ratio) : width, 1, width);
  const down = within(wider ? height : Math.round(width / ratio), 1, height);
  if (across === width && down === height) return null;
  const { x, y } = point ?? MIDDLE;
  return {
    left: within(Math.round(x * width - across / 2), 0, width - across),
    top: within(Math.round(y * height - down / 2), 0, height - down),
    width: across,
    height: down,
  };
}
