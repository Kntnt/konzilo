// The check before a save: the body as the draft holds it, through the intake's own check in
// the browser. A thrown error stops the save, with each reason in the interface language, and
// the draft stays in the form. The intake remains the check that counts, so a check that
// could not run lets the save through, and the field has told the editor it is off.

import { handsFor, loadReader, refusalsOf } from './check.js';
import { wordsShown } from '../refusals.js';
import { say } from './texts.js';

const bodiesOf = (entry) => {
  const bodies = [{ locale: null, body: entry.getIn(['data', 'body']) }];
  for (const [locale, data] of entry.get('i18n')?.entries() ?? []) bodies.push({ locale, body: data.getIn(['data', 'body']) });
  return bodies.filter(({ body }) => typeof body === 'string');
};

const words = ({ path, reason }) => (path ? `${say('body.block', { path })}: ${wordsShown(reason)}` : wordsShown(reason));

// The refusal of an entry, one problem a line, or null where it may be saved.
export async function refusalOf(entry, body) {
  const reader = await loadReader();
  if (!reader) return null;
  const refused = [];
  try {
    for (const { locale, body: value } of bodiesOf(entry)) {
      for (const problem of refusalsOf(value, handsFor(reader, body))) refused.push(locale ? `${locale}: ${words(problem)}` : words(problem));
    }
  } catch (error) {
    console.warn(`The early check could not run: ${error.message}`);
    return null;
  }
  return refused.length === 0 ? null : refused.join('\n');
}
