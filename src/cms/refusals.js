// A refusal or a warning as the editor shows it, in its interface language (ADR 0066): by
// the name and values it carries, from the field's early check, the preview or the publish
// status alike (refusals.js). A build's record may come from another version of the core,
// whose names these catalogues lack; such a reason is shown in the British English it carries.

import { messageIn, placeIn, reasonIn, wordsIn } from '../refusals.js';
import { interfaceLanguage, say } from './interface-language.js';

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

// A refusal at Save, from a check before Sveltia saves, a `preSave` handler: thrown, so that the
// save stops, and shown in Sveltia's dialog under the editor's own words, since nothing failed.
// The patched dialog asks for those words by the reason it shows, and tells a refusal from a
// failure by it, so only the latest reason thrown here has them (patches.json).
let refusedAtSave = null;
const wordsAbove = (shown) => (refusedAtSave !== null && shown === refusedAtSave ? say('body.refused') : undefined);

export function refuseAtSave(reason) {
  refusedAtSave = reason;
  globalThis.__KONZILO_REFUSAL_WORDS__ = wordsAbove;
  throw new Error(reason);
}
