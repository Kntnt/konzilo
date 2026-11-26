// A page's Markdown alternate as the public host and the dev server both answer it (ADR 0047): its
// address, and how much of an Accept header either weighs before it prefers Markdown. It imports
// nothing, so that the builder, which writes the public host's rules, takes none of the Astro side.

// The address of the Markdown alternate of the page at `path`, a path from
// the site's root that ends in a slash: the path without its last slash,
// then `.md`, and `/index.md` for the start page. A path whose last part is
// `index` keeps its slash before `index.md`, so that no page takes the start
// page's.
export function markdownAddress(path) {
  if (path === '/') return '/index.md';
  const trimmed = path.replace(/\/$/, '');
  return trimmed.endsWith('/index') ? `${trimmed}/index.md` : `${trimmed}.md`;
}

// The most ranges and characters of an Accept header the public host weighs,
// each range against each other: a longer header gets HTML there, and so on
// the dev server.
export const ACCEPT_RANGES = 32;
export const ACCEPT_LENGTH = 1024;
