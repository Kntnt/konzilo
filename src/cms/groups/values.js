// A post's values as the editor reads them outside its field groups: flat, with each group's
// fields as they are now (ADR 0071), for the preview, a field's fallback and the checks at Save.
// The editor names its configuration's groups once it has fetched it; until then, and in a
// test, there are none.

import { formValues } from './source.js';

const plain = (value) => (value?.toJS ? value.toJS() : value);

let known = {};

export function useGroups(groups) {
  known = groups ?? {};
}

export function postValues(data) {
  return formValues(plain(data) ?? {}, known);
}
