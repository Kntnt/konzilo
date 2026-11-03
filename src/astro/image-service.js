// Astro's image service on a Konzilo site: Astro's own, which
// makes images with sharp, but for an SVG asked for as a raster, such as a
// PNG for sharing or an icon, which it would draw only at the SVG's own size,
// and only with `image.dangerouslyProcessSVG`. Here sharp draws the SVG at the
// size asked for, and Astro's service makes the raster from that drawing as
// from any picture, so the option stays off. An SVG shown as an SVG passes
// through Astro's service unchanged. And a picture asked for at a width and a
// height to fill (`fit: 'cover'`), as a sharing image is, is
// enlarged where it is smaller, which Astro's service never does, so that
// the image has the size the page says it has.
//
// Drawing an SVG with sharp is safe on a Konzilo site only because every SVG
// master has passed the intake's check (node/src/format/svg.js); a site's
// own SVGs are its developers'.

import sharpService from 'astro/assets/services/sharp';

// An SVG, as Astro's own detector knows one: an <svg> tag in its first
// kilobyte.
const SVG = /<svg\s([^>"']|"[^"]*"|'[^']*')*>/;

function isSvg(bytes) {
  return SVG.test(bytes.toString('utf8', 0, 1000));
}

// The density at which sharp draws the SVG at least `width` wide and
// `height` high, either of which may be absent. sharp draws a size in pixels
// in proportion to the density, and one in a unit of length, such as mm,
// in proportion to its square.
async function densityFor(sharp, input, { width, height }) {
  const at = async (density) => sharp(input, { density }).metadata();
  const own = await at(72);
  const twice = await at(144);
  const power = Math.max(1, Math.log2(twice.width / own.width));
  const needed = (size) => Math.max(...[[width, size.width], [height, size.height]].filter(([wanted]) => wanted).map(([wanted, has]) => wanted / has), 1e-6);
  let density = Math.min(100_000, Math.max(1, 72 * needed(own) ** (1 / power)));
  for (let tries = 0; tries < 4; tries += 1) {
    const short = needed(await at(density));
    if (short <= 1) break;
    density = Math.min(100_000, density * short ** (1 / power) * 1.001);
  }
  return density;
}

// The SVG `input` drawn by sharp as a PNG at least `width` wide and `height`
// high, either of which may be absent, or at its own size without either.
// The site's icons are drawn here too (site-icons.js).
export async function drawSvg(input, { width, height } = {}) {
  const { default: sharp } = await import('sharp');
  const density = width || height ? await densityFor(sharp, input, { width, height }) : 72;
  return sharp(input, { density }).png().toBuffer();
}

// Whether a raster is asked for at a width and a height to fill, as a
// sharing image is (search-and-sharing.js), from a picture smaller than
// that in either: Astro's service never enlarges, so it would give a smaller
// image than the size asked for, which the page says it has.
async function smallerThanAskedToFill(sharp, input, { width, height, fit }) {
  if (fit !== 'cover' || !width || !height) return false;
  const size = await sharp(input).metadata();
  const [across, down] = (size.orientation ?? 1) >= 5 ? [size.height, size.width] : [size.width, size.height];
  return across < width || down < height;
}

const service = {
  ...sharpService,
  async transform(input, options, config, logger) {
    const { default: sharp } = await import('sharp');
    if (!isSvg(input)) {
      if (!(await smallerThanAskedToFill(sharp, input, options))) return sharpService.transform(input, options, config, logger);
      // Enlarged to fill the size asked for, then made as asked.
      const { width, height, position } = options;
      const filled = await sharp(input).rotate().resize({ width, height, fit: 'cover', position }).png().toBuffer();
      return sharpService.transform(filled, options, config, logger);
    }
    if (options.format === undefined || options.format === 'svg') {
      return sharpService.transform(input, options, config, logger);
    }
    return sharpService.transform(await drawSvg(input, options), options, config, logger);
  },
};

export default service;
