// What the service for editors and the purge's program share, in a folder only the two of them
// mount (ADR 0078), so that no other program, the builder that runs the site's code least of all,
// can ask for a purge or read a passage: the purge the service asks for, how the program says it
// stands, its progress step by step, and a search for a passage with its answer, each taken as soon
// as it is read. Written whole and then moved into place, so that a reader never meets half a file.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REQUEST = 'purge-request.json';
const STATE = 'purge-state.json';
const PROGRESS = 'purge-progress.json';
const SEARCH_REQUEST = 'passage-search.json';
const SEARCH_ANSWER = 'passage-found.json';

// The name the service gives a purge or a search, which names the program's folder for it.
export const isPurgeId = (id) => typeof id === 'string' && /^[0-9a-z-]{1,64}$/.test(id);

export function purgeControl(folder) {
  const place = (name) => join(folder, name);
  const write = (name, value) => {
    mkdirSync(folder, { recursive: true });
    writeFileSync(`${place(name)}.new`, `${JSON.stringify(value)}\n`);
    renameSync(`${place(name)}.new`, place(name));
  };
  const read = (name) => {
    try {
      return JSON.parse(readFileSync(place(name), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
      throw error;
    }
  };
  const take = (name) => rmSync(place(name), { force: true });
  // A file that names a purge or a search, or null where it names none by a name it may have.
  const named = (name) => {
    const value = read(name);
    return isPurgeId(value?.id) ? value : null;
  };
  // Takes a file where it names `id` alone, so that one written for another since stays.
  const takeIf = (name, id) => {
    if (read(name)?.id === id) take(name);
  };
  return {
    // The purge the service asks for, taken by its name alone.
    askPurge: (request) => write(REQUEST, request),
    purgeRequest: () => named(REQUEST),
    takePurgeRequest: (id) => takeIf(REQUEST, id),

    // How the purge's program says a purge stands.
    purgeState: () => named(STATE),
    writePurgeState: (state) => write(STATE, state),

    // How far the program has come with a purge, step by step, from its first push until it is
    // done, so that one stopped or broken after that push is finished where it was.
    progress: () => named(PROGRESS),
    writeProgress: (progress) => write(PROGRESS, progress),
    takeProgress: (id) => takeIf(PROGRESS, id),

    // A search for a passage, and the program's answer.
    askSearch: (request) => write(SEARCH_REQUEST, request),
    searchRequest: () => read(SEARCH_REQUEST),
    takeSearchRequest: () => take(SEARCH_REQUEST),
    answerSearch: (answer) => write(SEARCH_ANSWER, answer),
    searchAnswer: () => read(SEARCH_ANSWER),
    takeSearchAnswer: () => take(SEARCH_ANSWER),
  };
}
