// A refusal and a warning: the same shape, data a program can show and a person can
// act on. What it is about, by what it names: a post by ID, type and title, the block
// by path and name, or the field; or a file with the entry or the setting in it. The
// reason is the rule data's words, and a message says the whole.

import { labelIn, SOURCE_LANGUAGE } from '../catalogues.js';
import rules from '../format/rules.json' with { type: 'json' };

// A site's own label as a refusal names it: in British English, as the command line
// and the build log write every refusal.
export const british = (label) => labelIn(label, SOURCE_LANGUAGE);

// The words of a refusal, from the rule data. A key the rule data lacks is a fault
// in the core, so it throws, and the intake fails closed.
export function say(key, values = {}) {
  const words = rules.refusals[key];
  if (typeof words !== 'string') throw new Error(`the rule data has no words for the refusal ${key}`);
  return words.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

const where = ({ block, field, entry, setting, line }) => [
  block ? `block ${block.path} (${block.name})` : null,
  field ? `the field ${field}` : null,
  entry ? `entry ${entry}` : null,
  setting ? `the setting ${setting}` : null,
  line ? `line ${line}` : null,
].filter(Boolean).join(', ');

const subject = ({ post, file }) => (post
  ? `The ${post.type} "${post.title}" (${post.id})`
  : `The file ${file}`);

// A refusal or a warning for `{ post | file, block, field, entry, setting, line,
// reason }`.
export function named(about) {
  const place = where(about);
  const clean = Object.fromEntries(Object.entries(about).filter(([, value]) => value !== undefined && value !== null));
  return { ...clean, message: `${subject(about)}${place ? `, ${place}` : ''}: ${about.reason}` };
}
