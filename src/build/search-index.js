// The site's search at a build (ADR 0053): the documents of the release in use, made from its
// content files, imported into a new collection that the site's alias switches to, and the web
// server's route to it, with the scoped key that holds the search every query runs. The route is
// written where the web server reads it and no visitor reaches it, never into a release, and
// whole or not at all, since the web server reads it by itself as it changes. A site without
// search asks nothing of Typesense, and its route says that it has none.

import { execFile } from 'node:child_process';
import { renameSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';

import { ensureSearchKey, indexSearch, scopedSearchKey } from '../typesense.js';
import { searchRoute } from './web-server.js';

const run = promisify(execFile);
const BIG = 1024 * 1024 * 256;

// The site's search documents, its collection's schema and the search every query runs, as the
// site's own installed core makes them (`konzilo-search documents`), reading the content files
// as the site does, with Astro's reader: a program of its own, as the intake and Astro are,
// since the builder has no Astro. `program`: that command's file in the site's dependencies.
// `site`, `content`: the site description's file and the content folder. Gives
// { schema, parameters, documents }, or throws, saying why.
export function searchDocumentsCommand({ program, site, content, environment, command = run }) {
  return async () => {
    let stdout;
    try {
      ({ stdout } = await command(process.execPath, [program, 'documents', '--site', site, '--content', content], { env: environment, maxBuffer: BIG }));
    } catch (error) {
      throw new Error(`the search documents could not be made: ${(error.stderr || error.message).trim()}`);
    }
    return JSON.parse(stdout);
  };
}

// `typesense`: Typesense's origin, such as http://typesense:8108, where the builder indexes and
// the web server's route searches (src/arrangement.js). `key`: its admin key.
// `searchKey`: the site's search key, which searches its collection alone and which the route's
// key is made from. `collection`: the site's alias, named as the site. `site`: its site
// description, as read. `documents()`: as searchDocumentsCommand() gives it. `route`: the file
// the web server reads the route from. Gives a function that makes the index and writes the
// route, and throws, saying why, when the documents cannot be made or Typesense does not answer
// or refuses one, which leaves the site's collection and the route as they were.
export function siteSearch({ typesense, key, searchKey, collection, site, documents, route }) {
  const write = (text) => {
    const writing = `${route}.writing`;
    writeFileSync(writing, text);
    renameSync(writing, route);
  };
  return async () => {
    if (site.search === null) {
      write(searchRoute({ collection, key: null }));
      return;
    }
    const made = await documents();
    await ensureSearchKey({ typesense, key, collection, searchKey });
    await indexSearch({ typesense, key, collection, schema: made.schema, documents: made.documents });
    write(searchRoute({ collection, key: scopedSearchKey(searchKey, made.parameters), upstream: typesense }));
  };
}
