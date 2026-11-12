// The preview's own pages, which its gate shows in a tab of its own in place of the site's: a
// person refused, a sign-in that did not complete, the preview starting or not, and a saved post
// the site cannot publish. Each is a heading and a sentence in the interface language, with at
// most a link to try again or a list of what to change, and holds nothing of the site, no script
// and nothing loaded from elsewhere (ADR 0032).

import { interfaceLanguageTag, text } from '../catalogues.js';
import { placeIn, reasonIn } from '../refusals.js';

// Each page by what it says, its texts named whole, so that tests/catalogues.test.js finds them.
export const TAB_PAGES = Object.freeze({
  refused: { title: 'previewTab.refusedTitle', says: 'previewTab.refused' },
  signInFailed: { title: 'previewTab.signInFailedTitle', says: 'previewTab.signInFailed' },
  forgejoDown: { title: 'previewTab.signInFailedTitle', says: 'previewTab.forgejoDown' },
  starting: { title: 'previewTab.startingTitle', says: 'previewTab.starting' },
  notStarted: { title: 'previewTab.notStartedTitle', says: 'previewTab.notStarted' },
  postRefused: { title: 'previewTab.postRefusedTitle', says: 'previewTab.postRefused' },
});

const escaped = (value) => String(value).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

// A refusal of a post in a language, as its form would show it: where in the post, and why. A
// reason by a name these catalogues lack is shown in the words it came in.
export function refusalIn(language, refusal) {
  let reason;
  try {
    reason = reasonIn(language, refusal);
  } catch {
    reason = refusal.reason ?? '';
  }
  const place = placeIn(language, { ...refusal, line: undefined });
  return place ? `${place}: ${reason}` : reason;
}

// The page `page` (one of TAB_PAGES) in `language`, its sentence filled from `values`, with a
// link to `again` where it is given, and a list of `items`, each a text, where they are given,
// which loads itself again every `refresh` seconds where that is given.
export function tabPage(page, language, { again = null, refresh = null, values = {}, items = [] } = {}) {
  const title = text(language, page.title);
  return `<!doctype html>
<html lang="${escaped(interfaceLanguageTag(language))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
${refresh === null ? '' : `<meta http-equiv="refresh" content="${Number(refresh)}">\n`}<title>${escaped(title)}</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem; box-sizing: border-box; }
main { max-width: 32rem; }
h1 { font-size: 1.375rem; margin: 0 0 0.5rem; }
</style>
</head>
<body>
<main>
<h1>${escaped(title)}</h1>
<p>${escaped(text(language, page.says, values))}</p>
${items.length === 0 ? '' : `<ul>\n${items.map((item) => `<li>${escaped(item)}</li>\n`).join('')}</ul>\n`}${again === null ? '' : `<p><a href="${escaped(again)}">${escaped(text(language, 'previewTab.tryAgain'))}</a></p>\n`}</main>
</body>
</html>
`;
}
