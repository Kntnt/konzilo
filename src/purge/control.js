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

// `folder`: the folder, or null for none, where what is written is kept in memory alone, as for a
// service with no purge's program beside it.
export function purgeControl(folder) {
  const place = (name) => join(folder, name);
  const kept = new Map();
  const write = (name, value) => {
    if (folder === null) return void kept.set(name, JSON.stringify(value));
    mkdirSync(folder, { recursive: true });
    writeFileSync(`${place(name)}.new`, `${JSON.stringify(value)}\n`);
    renameSync(`${place(name)}.new`, place(name));
  };
  const read = (name) => {
    try {
      return JSON.parse(folder === null ? kept.get(name) ?? 'null' : readFileSync(place(name), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
      throw error;
    }
  };
  const take = (name) => (folder === null ? void kept.delete(name) : rmSync(place(name), { force: true }));
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

// The steps of a purge, in the order it takes them: what it will push, `planned`; the source
// pushed, `source`; the content pushed, `content`; what went let go by Forgejo, `collected`; its
// archives removed, `archives`; and the build log without what went, `log`. Once the source is
// pushed, a purge that has not taken the last is unfinished.
export const PURGE_STEPS = ['planned', 'source', 'content', 'collected', 'archives', 'log'];

// A purge's progress, `kept`, { id, request, steps, planned }, as `control` keeps it: { request,
// planned, has(step), did(step, more) }, `did` writing that a step is taken, with what more it
// learned, before it gives.
export function progressOf(control, kept) {
  let held = { ...kept, steps: [...kept.steps] };
  return {
    request: held.request,
    get planned() {
      return held.planned ?? null;
    },
    has: (step) => held.steps.includes(step),
    async did(step, more = {}) {
      held = { ...held, ...more, steps: held.steps.includes(step) ? held.steps : [...held.steps, step] };
      control.writeProgress(held);
    },
  };
}
