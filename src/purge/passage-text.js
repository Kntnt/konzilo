// A passage as an Admin gives it for a search and a purge (ADR 0078), and how long it may be,
// which the service and the editor's page share, so it imports nothing.

// The shortest and the longest passage, in characters.
export const PASSAGE_LEAST = 3;
export const PASSAGE_MOST = 500;

// A passage as given, trimmed, each run of whitespace in it one space, or null where it is none
// or too short or too long.
export function passageOf(given) {
  if (typeof given !== 'string') return null;
  const passage = given.replace(/\s+/gu, ' ').trim();
  const length = [...passage].length;
  return length >= PASSAGE_LEAST && length <= PASSAGE_MOST ? passage : null;
}
