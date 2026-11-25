// How the editor scales an image down before it is uploaded (ADR 0022): in plain JavaScript, with
// a Lanczos filter of three lobes, the one sharp uses, so that every browser makes the same pixels
// of the same decoded picture, which its canvas would not.
//
// It reads the picture a band of rows at a time, from the top, and keeps only the few rows the
// filter reaches at once, so that a photograph of many millions of pixels is never held whole a
// second time, nor drawn on a canvas larger than a browser allows. Colours are weighed by their
// opacity, so that what a clear pixel hides never bleeds into its neighbours.

const LOBES = 3;
const BAND = 64;

// The size an image is converted to: its longest side at most `longest`, in proportion, and never
// larger than it is.
export function fitted({ width, height }, longest) {
  const scale = Math.min(1, longest / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const lanczos = (x) => (x > -LOBES && x < LOBES ? sinc(x) * sinc(x / LOBES) : 0);

// For each pixel of a line `to` long made from one `from` long: the first pixel of the old it is
// made of, how many, and the weight of each, which add up to one. Scaling down, the filter widens
// with the scale, so that each new pixel takes in all the old ones it stands for.
function contributions(from, to) {
  const scale = from / to;
  const stretch = Math.max(1, scale);
  const reach = LOBES * stretch;
  const span = Math.ceil(reach) * 2 + 1;
  const firsts = new Int32Array(to);
  const counts = new Int32Array(to);
  const weights = new Float64Array(to * span);
  for (let at = 0; at < to; at += 1) {
    const centre = (at + 0.5) * scale;
    const first = Math.max(0, Math.ceil(centre - reach - 0.5));
    const last = Math.min(from - 1, Math.floor(centre + reach - 0.5));
    let total = 0;
    for (let one = first; one <= last; one += 1) {
      const weight = lanczos((one + 0.5 - centre) / stretch);
      weights[at * span + one - first] = weight;
      total += weight;
    }
    for (let one = 0; one <= last - first; one += 1) weights[at * span + one] /= total;
    firsts[at] = first;
    counts[at] = last - first + 1;
  }
  return { span, firsts, counts, weights };
}

const clamped = (value) => (value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value));

// The picture, `{ width, height, rows(from, to) }`, where `rows` gives the RGBA of those rows, at
// `size`, `{ width, height }`, no larger than it: its RGBA.
export function resized({ width, height, rows }, size) {
  const across = contributions(width, size.width);
  const down = contributions(height, size.height);

  // The rows of the source as far as read, a band at a time.
  let band = { from: 0, to: 0, data: null };
  const sourceRow = (row) => {
    if (row >= band.to) {
      const to = Math.min(height, row + BAND);
      band = { from: row, to, data: rows(row, to) };
    }
    return (row - band.from) * width * 4;
  };

  // A source row scaled across, its colours weighed by their opacity, kept in a ring of as many
  // rows as the filter reaches down.
  const ring = Array.from({ length: down.span }, () => new Float64Array(size.width * 4));
  let made = 0;
  const across1 = (row) => {
    const start = sourceRow(row);
    const { data } = band;
    const into = ring[row % down.span];
    for (let x = 0; x < size.width; x += 1) {
      const first = across.firsts[x];
      const offset = x * across.span;
      let red = 0;
      let green = 0;
      let blue = 0;
      let opacity = 0;
      for (let one = 0, at = start + first * 4; one < across.counts[x]; one += 1, at += 4) {
        const weight = across.weights[offset + one];
        const seen = weight * data[at + 3];
        red += seen * data[at];
        green += seen * data[at + 1];
        blue += seen * data[at + 2];
        opacity += seen;
      }
      into.set([red, green, blue, opacity], x * 4);
    }
  };

  const out = new Uint8ClampedArray(size.width * size.height * 4);
  for (let y = 0; y < size.height; y += 1) {
    const first = down.firsts[y];
    const count = down.counts[y];
    for (; made < first + count; made += 1) across1(made);
    const offset = y * down.span;
    for (let x = 0; x < size.width * 4; x += 4) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let opacity = 0;
      for (let one = 0; one < count; one += 1) {
        const weight = down.weights[offset + one];
        const from = ring[(first + one) % down.span];
        red += weight * from[x];
        green += weight * from[x + 1];
        blue += weight * from[x + 2];
        opacity += weight * from[x + 3];
      }
      const alpha = clamped(opacity);
      const at = y * size.width * 4 + x;
      if (alpha === 0) continue;
      out[at] = clamped(red / opacity);
      out[at + 1] = clamped(green / opacity);
      out[at + 2] = clamped(blue / opacity);
      out[at + 3] = alpha;
    }
  }
  return out;
}
