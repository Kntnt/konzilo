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
//
// A picture asked for in widths (image-versions.js) is made in each of them up
// to its master's width and the widest the core makes, with its master's own
// width, or that widest, in place of those wider (versionWidths()), and, unless
// a size is asked for, written at the widest of them, so that its `src` is one
// of its versions and no version is wider than it needs to be. A WebP is made
// at the core's quality unless another is asked for, and a lossless master's
// WebP is lossless, at any width (ADR 0022). A picture asked for at a display
// width (DISPLAY_WIDTH_OPTION) narrower than it is written with its `width` and
// `height` at that width, by its proportions, so that the page draws it at most
// that wide, its `src` and its versions as they were.
//
// A picture asked to be cropped to an aspect ratio (RATIO_OPTION) around a focal
// point (FOCAL_POINT_OPTION), as cropOptions() asks, is cropped as cropOf() says: as
// large as fits, centred on the point as far as its edges allow, and each of its
// versions is that crop alone, scaled, so that no pixel outside it is sent, and
// none wider than the crop. Its options are then Astro's own, a size in the
// crop's proportions, `fit: 'cover'` and the point as its `position`
// (focalPointPosition()), so that Astro names each version by them and its dev
// server makes it from its address; and any picture asked for at a size to fill
// with a focal point as its `position`, as a sharing image is, is cropped around
// that point. One in the ratio already is not cropped, and an SVG never is.

import sharpService from 'astro/assets/services/sharp';
import { cropOf, focalPointIn, MIDDLE } from '../format/focal-point.js';
import { isLosslessWebp } from '../format/originals.js';
import { DISPLAY_WIDTH_OPTION, FOCAL_POINT_OPTION, focalPointOfPosition, focalPointPosition, QUALITY, RATIO_OPTION, versionWidths } from './image-versions.js';

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

// A picture of Astro's own, imported, as its pipeline hands one over.
const isImported = (src) => typeof src === 'object' && src !== null && typeof src.width === 'number' && typeof src.height === 'number';

// The options of a picture asked to be cropped to a ratio around a focal point, `validated`, as
// Astro's own options for that crop: a size in the crop's proportions, at its widest version
// where it is asked for in widths, none wider than the crop, else at the width asked for or the
// crop's own, `fit: 'cover'` and the point as its `position`. True where it is cropped.
function cropped(validated, ratio, point) {
  const { src } = validated;
  if (!(ratio > 0) || !isImported(src) || src.format === 'svg') return false;
  const crop = cropOf(src, ratio, point);
  if (crop === null) return false;
  if (Array.isArray(validated.widths) && validated.widths.length > 0 && !validated.densities) {
    validated.widths = versionWidths(validated.widths, crop.width);
    validated.width = validated.widths.at(-1);
  } else validated.width = Math.min(validated.width ?? crop.width, crop.width);
  validated.height = Math.round((validated.width * crop.height) / crop.width);
  validated.fit = 'cover';
  validated.position = focalPointPosition(point);
  return true;
}

const service = {
  ...sharpService,
  async validateOptions(options, imageConfig, logger) {
    const { [RATIO_OPTION]: ratio, [FOCAL_POINT_OPTION]: point, ...rest } = options;
    const validated = await sharpService.validateOptions(rest, imageConfig, logger);
    if (validated.format === 'webp' && validated.quality === undefined) validated.quality = QUALITY;
    if (cropped(validated, Number(ratio), focalPointIn(point) ?? MIDDLE)) return validated;
    const { src } = validated;
    // Asked for in widths, at no size of its own: Astro hands it over at its master's size.
    const asked = Array.isArray(validated.widths) && validated.widths.length > 0 && !validated.densities && isImported(src) && src.format !== 'svg';
    if (asked && validated.width === src.width && validated.height === src.height) {
      validated.widths = versionWidths(validated.widths, src.width);
      validated.width = validated.widths.at(-1);
      validated.height = Math.round((validated.width * src.height) / src.width);
    }
    return validated;
  },
  async getHTMLAttributes(options, imageConfig, logger) {
    const { [DISPLAY_WIDTH_OPTION]: display, ...rest } = options;
    const attributes = await sharpService.getHTMLAttributes(rest, imageConfig, logger);
    const { width, height } = attributes;
    if (!(display > 0) || !(width > display)) return attributes;
    return { ...attributes, width: display, height: Math.round((height * display) / width) };
  },
  async transform(input, options, config, logger) {
    const { default: sharp } = await import('sharp');
    // A lossless master's versions are lossless, whatever the quality.
    if (!isSvg(input) && (options.format ?? 'webp') === 'webp' && isLosslessWebp(input)) {
      const own = config.service?.config ?? {};
      config = { ...config, service: { ...config.service, config: { ...own, webp: { ...own.webp, lossless: true } } } };
    }
    const point = focalPointOfPosition(options.position);
    const raster = !isSvg(input) || (options.format !== undefined && options.format !== 'svg');
    if (point !== null && raster && options.fit === 'cover' && options.width && options.height) {
      // The crop around the point, at the size asked for, enlarged where it is smaller, and
      // without loss until Astro's service writes it as asked.
      const picture = isSvg(input) ? await drawSvg(input, options) : input;
      const { width, height } = options;
      const shape = await sharp(picture).metadata();
      const [across, down] = (shape.orientation ?? 1) >= 5 ? [shape.height, shape.width] : [shape.width, shape.height];
      const crop = cropOf({ width: across, height: down }, width / height, point) ?? { left: 0, top: 0, width: across, height: down };
      const made = await sharp(picture).rotate().extract(crop).resize({ width, height, fit: 'fill', kernel: config.service?.config?.kernel }).png({ compressionLevel: 0 }).toBuffer();
      const { fit, position, ...asked } = options;
      return sharpService.transform(made, asked, config, logger);
    }
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
