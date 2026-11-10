// A refusal or a warning as the editor shows it, in its interface language (ADR 0066): by
// the name and values it carries, from the field's early check, the preview or the publish
// status alike (refusals.js). A build's record may come from another version of the core,
// whose names these catalogues lack; such a reason is shown in the British English it carries.

import { messageIn, placeIn, reasonIn, wordsIn } from '../refusals.js';
import { interfaceLanguage } from './body/texts.js';

const known = (show, about) => {
  try {
    return show();
  } catch {
    return about?.reason ?? about?.message ?? '';
  }
};

// A reason in the interface language: by its name, else in the words it came in.
export const wordsShown = (words) => known(() => wordsIn(interfaceLanguage(), words), words);

// A refusal or a warning of a post, which the post's form or row already names: where in
// the post, and why, `block 2.1 (list): …`. The line of its source file says nothing to
// an editor, who never sees it.
export function refusalShown(refusal) {
  const reason = known(() => reasonIn(interfaceLanguage(), refusal), refusal);
  const place = placeIn(interfaceLanguage(), { ...refusal, line: undefined });
  return place ? `${place}: ${reason}` : reason;
}

// A refusal or a warning of a file, which nothing else names: the file too.
export const fileRefusalShown = (refusal) => known(() => messageIn(interfaceLanguage(), { ...refusal, line: undefined }), { reason: refusal?.message ?? refusal?.reason });
