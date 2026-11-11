// Typesense as the core asks it (ADR 0053): the scoped key a visitor's search is made with, and
// the indexing that puts a site's documents into it, made of Typesense's own API alone. It
// imports nothing but Node's own, so that the builder, which has no Astro, indexes with it;
// `@kntnt/konzilo/search` gives the same.

import { createHmac } from 'node:crypto';

// A scoped search key (Typesense's own term): a key that runs the search
// `parameters` hold and nothing else, made from `searchKey`, a key that may
// search the site's collection alone, with no call to Typesense. Typesense
// applies the parameters it holds to every search made with it, over what
// the query says, so that a visitor can change none of them.
export function scopedSearchKey(searchKey, parameters) {
  const embedded = JSON.stringify(parameters);
  const digest = createHmac('sha256', searchKey).update(embedded).digest('base64');
  return Buffer.from(`${digest}${searchKey.slice(0, 4)}${embedded}`).toString('base64');
}

// How long indexing waits for Typesense to answer one call, and for the
// import of every document.
const ANSWER = 10_000;
const IMPORT = 300_000;

// A call to Typesense at `url` with the admin `key`: its answer's body,
// parsed, or `missing` for a 404 where one is given; an Error saying why
// otherwise.
async function call(url, key, method, path, { body, type = 'application/json', timeout = ANSWER, missing } = {}) {
  let answer;
  try {
    answer = await fetch(`${url}${path}`, {
      method,
      headers: { 'X-TYPESENSE-API-KEY': key, ...(body === undefined ? {} : { 'Content-Type': type }) },
      body,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw new Error(`Typesense does not answer at ${url}: ${error.message}`);
  }
  const text = await answer.text();
  if (answer.status === 404 && missing !== undefined) return missing;
  if (!answer.ok) {
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {
      // Not JSON: the text as it is.
    }
    const error = new Error(`Typesense answered ${answer.status} to ${method} ${path.split('?')[0]}: ${message}`);
    error.status = answer.status;
    throw error;
  }
  return type === 'text/plain' ? text : JSON.parse(text);
}

// Index a site's search documents in Typesense: import
// `documents` into a new collection of `schema` (searchDocuments()) and
// switch the site's collection, `collection`, an alias, to it in one step,
// then remove the collections it led to before. A search never sees a
// half-made index: until the switch it searches the collection before.
// `typesense`: Typesense's address, such as http://127.0.0.1:8108; `key`:
// its admin key. A new collection is named after the site's and the time,
// `<collection>-<milliseconds>`; every other collection of that form is the
// site's own, an earlier one or what a failed indexing left, and goes once
// the switch is made. Returns { collection, documents }, the new
// collection's name and how many documents it holds; throws, saying why,
// when Typesense does not answer or refuses a document, which leaves the
// site's collection as it was.
export async function indexSearch({ typesense, key, collection, schema, documents }) {
  const before = await call(typesense, key, 'GET', `/aliases/${encodeURIComponent(collection)}`, { missing: null });
  let name = `${collection}-${Date.now()}`;
  if (before?.collection_name === name) name = `${collection}-${Date.now() + 1}`;
  await call(typesense, key, 'POST', '/collections', { body: JSON.stringify({ ...schema, name }) });
  try {
    const lines = documents.map((document) => JSON.stringify(document)).join('\n');
    const answers = documents.length === 0 ? '' : await call(typesense, key, 'POST', `/collections/${encodeURIComponent(name)}/documents/import?action=create`, { body: lines, type: 'text/plain', timeout: IMPORT });
    answers.split('\n').filter((line) => line !== '').forEach((line, index) => {
      const result = JSON.parse(line);
      if (!result.success) throw new Error(`Typesense refused the search document ${documents[index].id}: ${result.error}`);
    });
    await call(typesense, key, 'PUT', `/aliases/${encodeURIComponent(collection)}`, { body: JSON.stringify({ collection_name: name }) });
  } catch (error) {
    await call(typesense, key, 'DELETE', `/collections/${encodeURIComponent(name)}`).catch(() => {});
    throw error;
  }
  const own = new RegExp(`^${escapeRegExp(collection)}-\\d+$`);
  for (const { name: other } of await call(typesense, key, 'GET', '/collections')) {
    if (other !== name && own.test(other)) await call(typesense, key, 'DELETE', `/collections/${encodeURIComponent(other)}`, { missing: null });
  }
  return { collection: name, documents: documents.length };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Make the site's search key, `searchKey`, a key that may search the site's
// collection, the alias `collection`, and do nothing else, whatever
// collection the alias leads to. Typesense keeps a key by its value, so a
// key made before is left as it is.
export async function ensureSearchKey({ typesense, key, collection, searchKey }) {
  const made = { description: `Search of ${collection}`, actions: ['documents:search'], collections: [collection], value: searchKey };
  try {
    await call(typesense, key, 'POST', '/keys', { body: JSON.stringify(made) });
  } catch (error) {
    if (error.status !== 409) throw error;
  }
}
