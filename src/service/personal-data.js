// A person's submissions, as privacy law asks (ADR 0045): an Admin finds them on the *Personal
// data* page by what the person wrote, such as their email address or their name, in every form
// and spam among them, then chooses which are theirs, to download them for the person or to erase
// them.

// The most submissions a search shows, and the most an Admin downloads or erases at once: a
// search that finds more is to be narrowed.
export const FOUND_AT_MOST = 100;

// The longest text an Admin searches by.
export const SEARCH_AT_MOST = 256;

// A text as it is compared: one form of each letter, such as an å written as a letter and its
// ring apart, in small letters.
const folded = (text) => text.normalize('NFKC').toLowerCase();

// The text searched by, from what an Admin gave, or null for none or too long.
export function soughtOf(given) {
  const text = typeof given === 'string' ? given.trim() : '';
  return text === '' || [...text].length > SEARCH_AT_MOST ? null : text;
}

// The submissions numbered by a list such as `3,7,9`, as given, or null for no list of at most
// FOUND_AT_MOST numbers.
export function idsOf(given) {
  if (typeof given !== 'string' || !/^[1-9][0-9]{0,15}(?:,[1-9][0-9]{0,15})*$/.test(given)) return null;
  const ids = [...new Set(given.split(',').map(Number))];
  return ids.length > FOUND_AT_MOST ? null : ids;
}

// The submissions in `store` that hold `text` in a value written in them, a text, in any case,
// newest first, spam among them: { submissions, more }, at most FOUND_AT_MOST, `more` whether
// there are others.
export function findSubmissions(store, text) {
  const sought = folded(text);
  const found = [];
  for (const submission of store.everything()) {
    if (!submission.fields.some(({ value }) => typeof value === 'string' && folded(value).includes(sought))) continue;
    if (found.length === FOUND_AT_MOST) return { submissions: found, more: true };
    found.push(submission);
  }
  return { submissions: found, more: false };
}
