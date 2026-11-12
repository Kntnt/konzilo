#!/usr/bin/env node
// The site's search index, in the site repository:
//
//   konzilo-search index --typesense <address> --key-file <file> --collection <name> [--search-key-file <file>] [--site <file>] [--content <folder>]
//   konzilo-search documents [--site <file>] [--content <folder>]
//
// Both read the site description (by default site-description.json in the
// working directory, the site repository's root) and make the site's search
// documents from its content files (by default content/), as
// searchDocuments() in src/search.js says.
//
// `index` puts them into Typesense at <address>, such as
// http://127.0.0.1:8108, with the admin key that <file> holds: into a new
// collection, to which it switches the site's collection, <name>, in one
// step (indexSearch()). With --search-key-file, it first makes the site's
// search key, the key that <file> holds, which searches the site's
// collection alone (ensureSearchKey()). A site without search has nothing
// to index, and Typesense is not asked.
//
// `documents` writes them on standard output, as one JSON object:
// { schema, parameters, documents }, the collection's schema without its
// name, the search parameters every query runs (searchParameters()), and the
// documents, for a build that indexes them itself.
//
// Exit status: 0 when the index is made, or the documents written; 1 when
// Typesense does not answer or refuses them, which leaves the site's
// collection as it was; 2 when the arguments or the site description are
// wrong.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ensureSearchKey, indexSearch, searchDocuments, searchParameters } from '../src/search.js';
import { readSiteDescription, SITE_DESCRIPTION_FILE } from '../src/site-description.js';

const usage = [
  'usage: konzilo-search index --typesense <address> --key-file <file> --collection <name> [--search-key-file <file>] [--site <file>] [--content <folder>]',
  '       konzilo-search documents [--site <file>] [--content <folder>]',
].join('\n');

function fail(message, status = 2) {
  process.stderr.write(`konzilo-search: ${message}\n`);
  process.exit(status);
}

let options;
let command;
try {
  const parsed = parseArgs({
    allowPositionals: true,
    options: {
      site: { type: 'string', default: SITE_DESCRIPTION_FILE },
      content: { type: 'string', default: 'content' },
      typesense: { type: 'string' },
      'key-file': { type: 'string' },
      'search-key-file': { type: 'string' },
      collection: { type: 'string' },
    },
  });
  options = parsed.values;
  [command] = parsed.positionals;
  if (parsed.positionals.length !== 1 || !['index', 'documents'].includes(command)) fail(usage);
} catch (error) {
  fail(`${error.message}\n${usage}`);
}
if (command === 'index' && (!options.typesense || !options['key-file'] || !options.collection)) fail(usage);

let site;
try {
  site = readSiteDescription(options.site);
} catch (error) {
  fail(error.message.startsWith('the site description') ? error.message : `the site description cannot be read: ${error.message}`);
}

const { documents, schema } = searchDocuments({ site, content: options.content });

if (command === 'documents') {
  process.stdout.write(`${JSON.stringify({ schema, parameters: searchParameters(site), documents })}\n`);
  process.exit(0);
}

if (site.search === null) {
  process.stdout.write('konzilo-search: the site has no search, so there is nothing to index\n');
  process.exit(0);
}

// A key file holds the key alone, maybe with a final newline.
function keyIn(file) {
  try {
    const key = readFileSync(file, 'utf8').trim();
    if (key === '') fail(`${file} holds no key`);
    return key;
  } catch (error) {
    return fail(`the key cannot be read: ${error.message}`);
  }
}

const key = keyIn(options['key-file']);
const searchKey = options['search-key-file'] ? keyIn(options['search-key-file']) : null;
try {
  if (searchKey !== null) await ensureSearchKey({ typesense: options.typesense, key, collection: options.collection, searchKey });
  const made = await indexSearch({ typesense: options.typesense, key, collection: options.collection, schema, documents });
  const posts = made.documents === 1 ? '1 post' : `${made.documents} posts`;
  process.stdout.write(`konzilo-search: the search index holds ${posts}, in ${made.collection}\n`);
} catch (error) {
  fail(error.message, 1);
}
