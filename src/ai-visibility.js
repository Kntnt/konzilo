// AI visibility: the content signals robots.txt writes, and the excluded paths,
// which leave a page out of its Markdown alternate, llms.txt and llms-full.txt.
// The Admin sets both in the core's settings group `ai`
// (format/settings-groups.json).
//
// A content signal says how AI may use the site's content: `search`,
// `aiInput` and `aiTrain`, each granted (`yes`), reserved (`no`) or
// deferred, which leaves it out and so to law and practice. robots.txt
// writes a comment and one `Content-Signal` line in its group for every
// crawler, or nothing when every signal is deferred, and never names
// llms.txt.
//
// The excluded paths are one regular expression per line, read as JavaScript
// reads one with the flags `iu`, matched against a page's path from the site's
// root, decoded.

import { coreSettingsGroups } from './settings-groups.js';

// The settings group's name.
export const AI_GROUP = 'ai';

// Each signal as the site settings name it, and as Content-Signal names it,
// in the order the line gives them.
const SIGNALS = [['search', 'search'], ['aiInput', 'ai-input'], ['aiTrain', 'ai-train']];

// What a granted and a reserved signal say; a deferred one says nothing.
const STATES = { grant: 'yes', reserve: 'no' };

// The lines robots.txt writes for the content signals the site settings
// hold, `{ search, aiInput, aiTrain }`, each `grant`, `reserve` or `defer`:
// none when every one is deferred.
export function contentSignalLines(signals) {
  const pairs = SIGNALS.filter(([name]) => Object.hasOwn(STATES, signals[name])).map(([name, said]) => `${said}=${STATES[signals[name]]}`);
  return pairs.length === 0 ? [] : ['# AI usage content signals', `Content-Signal: ${pairs.join(', ')}`];
}

// robots.txt's lines for the content signals of the site settings, as Astro
// reads them (robots.js), or the core's defaults while the site has none.
export function contentSignals({ settings }) {
  return contentSignalLines(settings?.[AI_GROUP]?.signals ?? defaultSignals());
}

// The content signals' defaults, as the core declares them.
function defaultSignals() {
  const part = coreSettingsGroups().find((group) => group.name === AI_GROUP).parts.find((found) => found.name === 'signals');
  return Object.fromEntries(part.settings.map((setting) => [setting.name, setting.default]));
}

// The paths of `paths` that a pattern of `text` matches, in their order: each
// a page's path from the site's root, such as `/pages/about/`, as written or
// percent-encoded, matched as it reads, decoded. A pattern that does not compile
// matches nothing.
export function excludedPaths(text, paths) {
  const patterns = text.split(/\r\n|\r|\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    try {
      return [new RegExp(line, 'iu')];
    } catch {
      return [];
    }
  });
  if (patterns.length === 0) return [];
  return paths.filter((path) => {
    let decoded = path;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      // A path that does not decode is matched as it is written.
    }
    return patterns.some((pattern) => pattern.test(decoded));
  });
}
