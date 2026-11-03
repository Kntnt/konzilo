// The site's theme colours, from the colour tokens the site names
// to the integration: its brand colour, `primary`, which
// a browser paints its own frame around the site in, and its page
// background, `base`, which a phone shows while the site opens from
// its home screen and which the Apple touch icon is laid on. Each is the
// token's value as the start page's root resolves it (theme-tokens.js),
// written as #rrggbb in sRGB, as every
// browser reads a colour in the manifest and in theme-color
// (opaque-color.js):
//
//   theme       the manifest's theme_color, and each page's
//               <meta name="theme-color">
//   background  the manifest's background_color, and the Apple touch
//               icon's background
//
// A role the site names no token for is left out, as is one whose value is
// no colour, or not an opaque one, which the build's log names. Without
// either, the manifest and the icons are as the site icon alone makes them
// (site-icons.js), and no page has a theme-color.
//
// The tokens resolve from the built start page, once every page is written,
// so a build writes the colours into its release afterwards: each page
// holds THEME_COLOR_MARK where Konzilo's Head puts the theme colour, and
// writeThemeColors() makes each mark the theme colour or takes it away, and
// makes the manifest and the Apple touch icon again with the colours.
// Astro's dev server, which builds no start page, shows none of them.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { opaqueColor } from './opaque-color.js';
import { COLORED, iconFile, siteIcon } from './site-icons.js';

// The colour role each theme colour takes, and what it colours.
export const THEME_ROLES = Object.freeze({
  theme: { role: 'primary', colors: 'the web app manifest\'s theme_color and every page\'s theme-color' },
  background: { role: 'base', colors: 'the web app manifest\'s background_color and the Apple touch icon\'s background' },
});

// What Head.astro writes into each page of a build where the theme colour
// goes, until the build has its colours: a comment, which a browser would
// pass over.
export const THEME_COLOR_MARK = '<!--konzilo:theme-color-->';

// The site's theme colours, { theme, background }, each only where the
// site names its role's token, from `colors`, the values the start page's
// root gives the tokens, by role, and `tokens`, the custom property the
// option names for each role. `warn` hears of a token left out.
export async function themeColors(colors, tokens, warn) {
  const made = {};
  for (const [use, { role, colors: what }] of Object.entries(THEME_ROLES)) {
    const property = tokens[role];
    if (property === undefined) continue;
    const value = colors[role];
    const color = value === undefined ? null : opaqueColor(value);
    if (color !== null) {
      made[use] = color;
      continue;
    }
    const problem = value === undefined ? 'has no value on the start page\'s root' : `is ${value} on the start page's root, which is not an opaque colour`;
    warn(`${what} go without the site's ${role} colour, since ${property}, which the option tokens names for it, ${problem}`);
  }
  return made;
}

// Write the theme colours, as themeColors() gives them, into the release
// `dir` (a file URL), built below `base`: each page's mark becomes the
// theme colour, or nothing without one, and the manifest and the Apple
// touch icon, where the site has an icon, take the colours.
export async function writeThemeColors(dir, { base, colors }) {
  const release = fileURLToPath(dir);
  const meta = colors.theme === undefined ? '' : `<meta name="theme-color" content="${colors.theme}">`;
  for (const path of readdirSync(release, { recursive: true })) {
    if (!path.endsWith('.html')) continue;
    const file = join(release, path);
    const html = readFileSync(file, 'utf8');
    if (html.includes(THEME_COLOR_MARK)) writeFileSync(file, html.replaceAll(THEME_COLOR_MARK, meta));
  }
  if (Object.keys(colors).length === 0) return;
  const icon = siteIcon();
  for (const address of COLORED) {
    const file = await iconFile(address, base, icon, colors);
    if (file !== null) writeFileSync(join(release, address.slice(1)), file.body);
  }
}
