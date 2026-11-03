// A site's colour as every browser reads one: in sRGB, as #rrggbb. The site's
// theme colours take it (theme-colors.js).

import { createRequire } from 'node:module';

// lightningcss is loaded once a colour is read, not with the integration.
const require = createRequire(import.meta.url);

// The CSS colour `value` in sRGB, as #rrggbb, or null when it is no colour,
// or not a wholly opaque one. lightningcss reads it, and writes a colour of
// another space, a mix or a relative colour in sRGB, as it does for a
// browser that knows only sRGB; it then reads that colour back.
export function opaqueColor(value) {
  if (/[;{}]/.test(value)) return null;
  const { transform } = require('lightningcss');
  const css = (color, options) => transform({ filename: 'color.css', code: Buffer.from(`a{color:${color}}`), minify: true, ...options }).code.toString();
  try {
    const srgb = /^a\{color:([^;}]*)/.exec(css(value, { targets: { chrome: 40 << 16 } }))?.[1];
    if (srgb === undefined) return null;
    let color = null;
    css(srgb, { visitor: { Declaration: (declaration) => { if (declaration.property === 'color') color = declaration.value; } } });
    if (color?.type !== 'rgb' || color.alpha !== 1) return null;
    return `#${[color.r, color.g, color.b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return null;
  }
}
