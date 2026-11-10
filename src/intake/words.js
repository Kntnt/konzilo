// A refusal and a warning: the same shape, data a program can show and a person can
// act on. What it is about, by what it names: a post by ID, type and title, the block
// by path and name, or the field; or a file with the entry or the setting in it. The
// reason by its name in the catalogues and the values that fill it, so that the editor
// shows it in its interface language (refusals.js); and the reason and a message that
// says the whole in British English, as the command line and the build log write them.

import { CATALOGUES, SOURCE_LANGUAGE } from '../catalogues.js';
import { british, messageIn } from '../refusals.js';

// A reason by its name in the catalogues, `refusal.…` or `warning.…`, and the values
// that fill it (refusals.js). A name the catalogues lack is a fault in the core, so it
// throws, and the intake fails closed.
export function say(name, values = {}) {
  if (typeof CATALOGUES[SOURCE_LANGUAGE][name] !== 'string') throw new Error(`the catalogues have no words for ${name}`);
  return { name, values };
}

// A refusal or a warning for `{ post | file, block, field, entry, setting, line,
// reason }`, its reason given by say(), or in the site's own words.
export function named(about) {
  const clean = Object.fromEntries(Object.entries(about).filter(([key, value]) => key !== 'reason' && value !== undefined && value !== null));
  const words = about.reason;
  const said = words !== null && typeof words === 'object' ? { name: words.name, values: words.values ?? {} } : {};
  const refusal = { ...clean, ...said, reason: british(words) };
  return { ...refusal, message: messageIn(SOURCE_LANGUAGE, refusal) };
}
