// The site's icons: every icon a browser, a phone or a search
// engine asks for, and the web app manifest, made from the site icon, the
// master settings.json names as `icon` (format/identity.js), which is
// square, and at least 512 pixels when it is not an SVG. Each is a route of
// the integration's own, in routes/, so that every build writes it at the
// root of the site below its base, the preview's too, and Astro's dev
// server answers it as the content files are now:
//
//   /favicon.ico            the icon at 16, 32 and 48 pixels, each a PNG
//   /icon.svg               the SVG master itself, when the icon is an SVG
//   /apple-touch-icon.png   180 pixels, opaque: a transparent icon on white,
//                           or on the site's background colour
//   /icon-192.png           192 pixels
//   /icon-512.png           512 pixels
//   /site.webmanifest       the site's title as its `name`, the two PNGs,
//                           and the site's theme colours
//
// A build writes the theme colours into the Apple touch icon and the
// manifest once its pages are written (theme-colors.js); the routes, and
// Astro's dev server, make them without.
//
// sharp draws each raster of an SVG at its size, and scales down a raster
// icon, so the same icon gives the same bytes. A site without an icon gets
// none of them: each route answers 404 with no body, which a build writes
// no file for. Head.astro links them in every page's head.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { contentFolder } from './collections.js';
import { drawSvg } from './image-service.js';
import { siteLanguages } from './languages.js';

const FAVICON = '/favicon.ico';
const SVG_ICON = '/icon.svg';
const TOUCH_ICON = '/apple-touch-icon.png';
const MANIFEST = '/site.webmanifest';

// The sizes, in pixels, of the images favicon.ico holds, of the Apple touch
// icon, and of the manifest's PNG icons, each at /icon-<size>.png.
const FAVICON_SIZES = [16, 32, 48];
const TOUCH_SIZE = 180;
const MANIFEST_SIZES = [192, 512];

// The background a transparent Apple touch icon is laid on, where the site
// has no background colour of its own (theme-colors.js).
const TOUCH_BACKGROUND = '#ffffff';

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

const pngIcon = (size) => `/icon-${size}.png`;

// The addresses of every icon and the manifest, below the site's base.
export const ICONS = [FAVICON, SVG_ICON, TOUCH_ICON, ...MANIFEST_SIZES.map(pngIcon), MANIFEST];

// The addresses of the files the site's theme colours change.
export const COLORED = [TOUCH_ICON, MANIFEST];

// The site icon as the content folder holds it: { title, path, svg }, the
// site's title or undefined, the path of the icon's master and whether it is
// an SVG; or null when the site has no icon. On a site in several languages,
// `languages`, the icon is the same in each language's settings file, and
// the title the main language's.
export function siteIcon(folder = contentFolder(), languages = siteLanguages()) {
  const file = resolve(folder, languages.length > 1 ? `settings/${languages[0].tag}.json` : 'settings.json');
  if (!existsSync(file)) return null;
  const { title, icon } = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof icon?.src !== 'string') return null;
  return { title: typeof title === 'string' ? title : undefined, path: resolve(dirname(file), icon.src), svg: icon.src.endsWith('.svg') };
}

// The address of an icon below the site's base, `/` or `/preview/`.
function below(base, address) {
  return `${base.replace(/\/$/, '')}${address}`;
}

// The <link> elements of a page's head for `icon`, as siteIcon() gives it,
// below `base`, each as its attributes: none without an icon.
export function iconLinks(base, icon = siteIcon()) {
  if (icon === null) return [];
  return [
    { rel: 'icon', href: below(base, FAVICON), sizes: FAVICON_SIZES.map((size) => `${size}x${size}`).join(' ') },
    ...(icon.svg ? [{ rel: 'icon', href: below(base, SVG_ICON), type: 'image/svg+xml' }] : []),
    { rel: 'apple-touch-icon', href: below(base, TOUCH_ICON) },
    { rel: 'manifest', href: below(base, MANIFEST) },
  ];
}

// The icon drawn, or scaled down, to a transparent PNG of `size` pixels
// square.
async function raster(icon, bytes, size) {
  const { default: sharp } = await import('sharp');
  const input = icon.svg ? await drawSvg(bytes, { width: size, height: size }) : bytes;
  return sharp(input).resize(size, size, { fit: 'contain', background: CLEAR }).png().toBuffer();
}

// An ICO file of PNG images, each { size, png }: its header, a directory
// entry for each image, 32 bits a pixel, and the images.
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + 16 * index;
    head.writeUInt8(size % 256, entry);
    head.writeUInt8(size % 256, entry + 1);
    head.writeUInt16LE(1, entry + 4);
    head.writeUInt16LE(32, entry + 6);
    head.writeUInt32LE(png.length, entry + 8);
    head.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map(({ png }) => png)]);
}

// The file at `address`, one of ICONS, for `icon` below `base`, with the
// site's theme colours `colors`, { theme, background }, either left out
// where the site has none (theme-colors.js), as { body, type }, or null
// when the site has none there.
export async function iconFile(address, base, icon = siteIcon(), colors = {}) {
  if (icon === null || (address === SVG_ICON && !icon.svg)) return null;
  const bytes = readFileSync(icon.path);
  if (address === SVG_ICON) return { body: bytes, type: 'image/svg+xml' };
  if (address === FAVICON) {
    const images = await Promise.all(FAVICON_SIZES.map(async (size) => ({ size, png: await raster(icon, bytes, size) })));
    return { body: ico(images), type: 'image/x-icon' };
  }
  if (address === TOUCH_ICON) {
    const { default: sharp } = await import('sharp');
    return { body: await sharp(await raster(icon, bytes, TOUCH_SIZE)).flatten({ background: colors.background ?? TOUCH_BACKGROUND }).png().toBuffer(), type: 'image/png' };
  }
  if (address === MANIFEST) {
    const icons = MANIFEST_SIZES.map((size) => ({ src: below(base, pngIcon(size)), sizes: `${size}x${size}`, type: 'image/png' }));
    const manifest = {
      ...(icon.title === undefined ? {} : { name: icon.title }),
      icons,
      ...(colors.theme === undefined ? {} : { theme_color: colors.theme }),
      ...(colors.background === undefined ? {} : { background_color: colors.background }),
    };
    return { body: `${JSON.stringify(manifest, null, 2)}\n`, type: 'application/manifest+json' };
  }
  const size = MANIFEST_SIZES.find((one) => pngIcon(one) === address);
  if (size === undefined) throw new Error(`Konzilo makes no icon at ${address}`);
  return { body: await raster(icon, bytes, size), type: 'image/png' };
}

// The answer at `address` below `base`: the file, or 404 with no body,
// which a build writes nothing for.
export async function iconResponse(address, base) {
  const file = await iconFile(address, base);
  if (file === null) return new Response(null, { status: 404 });
  return new Response(file.body, { headers: { 'Content-Type': file.type } });
}
