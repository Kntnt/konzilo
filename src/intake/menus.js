// A menu's published file: each entry leads to a post's or a term's current address, by
// ID, labelled with its title unless it has its own, or to an address of its own, with a
// line of description where it has one, one line of plain text. An
// entry whose target has no page now is left out, with the entries under it, and comes
// back by itself. A menu the site cannot publish is refused whole, naming each entry by
// its place, and keeps its last file.

import { isObject } from '../checks.js';
import { MENU_DESCRIPTION_LENGTH } from '../format/menus.js';
import { say } from './words.js';

const SCHEMES = /^(?:https?:\/\/|mailto:|tel:)/;

// A text holding what reads as HTML.
const MARKUP = /<\/?[a-zA-Z!?][^<>]*>/;

const validUrl = (url) => typeof url === 'string' && (SCHEMES.test(url) || (url.startsWith('/') && !url.startsWith('//'))) && !/\s/.test(url);

// The entries of a menu as a file writes them: { items, problems, warnings }.
// `leadsTo(id)` gives { address, title }, { none, words } or { reason }.
export function menuItems(given, leadsTo) {
  const problems = [];
  const warnings = [];
  const entries = (list, path) => {
    if (list === undefined || list === null) return [];
    if (!Array.isArray(list)) {
      problems.push({ entry: path || undefined, reason: say('refusal.menu-shape') });
      return [];
    }
    const out = [];
    list.forEach((entry, index) => {
      const place = path ? `${path}.${index + 1}` : String(index + 1);
      if (!isObject(entry)) {
        problems.push({ entry: place, reason: say('refusal.menu-shape') });
        return;
      }
      const label = typeof entry.title === 'string' ? entry.title.trim() : '';
      let url;
      let title = label;
      if (entry.post) {
        const target = leadsTo(String(entry.post));
        if (target.reason) {
          problems.push({ entry: place, reason: target.reason });
          return;
        }
        if (target.none !== undefined) {
          warnings.push({ entry: place, reason: say('warning.menu-no-page', { title: label || target.none || String(entry.post) }) });
          return;
        }
        url = target.address;
        title = label || target.title;
      } else if (entry.url) {
        if (!validUrl(entry.url)) {
          problems.push({ entry: place, reason: say('refusal.menu-url', { url: String(entry.url) }) });
          return;
        }
        url = entry.url;
      }
      const items = entries(entry.items, place);
      if (title === '') {
        problems.push({ entry: place, reason: say('refusal.menu-title') });
        return;
      }
      const description = descriptionOf(entry.description);
      if (description === null) {
        problems.push({ entry: place, reason: say('refusal.menu-description', { title, most: MENU_DESCRIPTION_LENGTH }) });
        return;
      }
      if (url === undefined && items.length === 0 && (entry.items ?? []).length === 0) {
        problems.push({ entry: place, reason: say('refusal.menu-nowhere', { title }) });
        return;
      }
      out.push({ title, ...(url === undefined ? {} : { url }), ...(description === '' ? {} : { description }), ...(items.length > 0 ? { items } : {}) });
    });
    return out;
  };
  const items = entries(isObject(given) ? given.items : given, '');
  return { items, problems, warnings };
}

// An entry's line of description, trimmed, '' for none, or null for what is not one line of
// plain text of at most MENU_DESCRIPTION_LENGTH characters.
function descriptionOf(given) {
  if (given === undefined || given === null) return '';
  if (typeof given !== 'string') return null;
  const text = given.trim();
  return /[\r\n]/.test(text) || MARKUP.test(text) || [...text].length > MENU_DESCRIPTION_LENGTH ? null : text;
}
