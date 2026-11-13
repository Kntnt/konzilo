// The start page an Admin chooses: the post named in the core's settings group `startPage`
// (settings-groups.json), which the site shows at its start page's address, `/`, in place of
// the start page of its own design, and at no other address. The intake writes the post's
// file as its type writes it, its derived fields among them, at the content folder's root,
// `start.<type>.md`, named by the post's type, so that the site reads it as a post of that
// type, and leaves it out of the settings file. Its address is the start page's, and a link,
// a menu entry or a rule that leads to it by its ID leads there; its address before is one
// of its old addresses. A site in several languages chooses none (ADR 0042), and a site
// whose Admin chooses none, or whose chosen post cannot serve, shows its own start page.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

// The group's name, in the source's settings file and on the Site settings page.
export const START_PAGE = 'startPage';

// The start page's content file, for a post of the type `type`, as the site description
// declares it, by its name.
export function startFile(type) {
  return `start.${type.name}.md`;
}

// The start page's content files in the content folder at `content`, each { type, file }, the
// type of the site description `site` (as checked) it is a post of, and its file's name: the one
// the intake writes where an Admin chose a start page that can serve, else none.
export function startPageFiles(content, site) {
  return Object.values(site.types).flatMap((type) => (existsSync(join(content, startFile(type))) ? [{ type, file: startFile(type) }] : []));
}

// The ID the site's collection of the post's type gives the start page's entry, which no
// post's slug or path can be, since every one of those has a segment before its slashes.
export const START_ENTRY = '/';

// The start page's address, on a site in one language.
export const START_ADDRESS = '/';
