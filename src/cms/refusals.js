// A refusal or a warning as the editor shows it, in its interface language (ADR 0066): by
// the name and values it carries, from the field's early check, the preview or the publish
// status alike (refusals.js).

import { messageIn, placeIn, reasonIn, wordsIn } from '../refusals.js';
import { interfaceLanguage } from './body/texts.js';

// A reason in the interface language: by its name, else in the words it came in.
export const wordsShown = (words) => wordsIn(interfaceLanguage(), words);

// A refusal or a warning of a post, which the post's form or row already names: where in
// the post, and why, `block 2.1 (list): …`. The line of its source file says nothing to
// an editor, who never sees it.
export function refusalShown(refusal) {
  const reason = reasonIn(interfaceLanguage(), refusal);
  const place = placeIn(interfaceLanguage(), { ...refusal, line: undefined });
  return place ? `${place}: ${reason}` : reason;
}

// A refusal or a warning of a file, which nothing else names: the file too.
export const fileRefusalShown = (refusal) => messageIn(interfaceLanguage(), { ...refusal, line: undefined });
