// A stand-in for Typesense, in memory, with the parts of its API
// that indexing uses, as Typesense 30.2 answers them: collections, their
// documents' import, aliases and keys, each only with the admin key. A
// document is refused, as Typesense refuses it, when a field the schema
// declares as a string is not one, or a field it does not make optional is
// missing; `refuse` refuses every document whose id it names, as a store
// that fails. Searches are the dev server's and the acceptance suite's,
// against the real one.

import { createServer } from 'node:http';

export function standInTypesense({ key = 'the-admin-key' } = {}) {
  const collections = new Map();
  const aliases = new Map();
  const keys = [];
  const refuse = new Set();
  const answer = (response, status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const url = new URL(request.url, 'http://typesense');
      const body = Buffer.concat(chunks).toString();
      if (url.pathname === '/health') return answer(response, 200, { ok: true });
      if (request.headers['x-typesense-api-key'] !== key) return answer(response, 401, { message: 'Forbidden - a valid `x-typesense-api-key` header must be sent.' });
      const parts = url.pathname.split('/').slice(1).map(decodeURIComponent);
      const route = `${request.method} /${parts.map((part, index) => (['collections', 'aliases'].includes(parts[index - 1]) ? ':' : part)).join('/')}`;
      switch (route) {
        case 'GET /collections':
          return answer(response, 200, [...collections.values()].map(({ name, fields, documents }) => ({ name, fields, num_documents: documents.size })));
        case 'POST /collections': {
          const schema = JSON.parse(body);
          if (collections.has(schema.name)) return answer(response, 409, { message: `A collection with name \`${schema.name}\` already exists.` });
          collections.set(schema.name, { ...schema, documents: new Map() });
          return answer(response, 201, { ...schema, num_documents: 0 });
        }
        case 'DELETE /collections/:': {
          const collection = collections.get(parts[1]);
          if (!collection) return answer(response, 404, { message: 'Not found.' });
          collections.delete(parts[1]);
          return answer(response, 200, { name: collection.name });
        }
        case 'POST /collections/:/documents/import': {
          const collection = collections.get(aliases.get(parts[1]) ?? parts[1]);
          if (!collection) return answer(response, 404, { message: 'Collection not found' });
          const lines = body.split('\n').filter((line) => line !== '').map((line) => {
            const document = JSON.parse(line);
            const wrong = collection.fields.find((field) => (document[field.name] === undefined ? !field.optional
              : field.type === 'string' && typeof document[field.name] !== 'string'));
            if (refuse.has(document.id)) return { code: 500, error: 'Could not write the document.', success: false };
            if (wrong) return { code: 400, error: `Field \`${wrong.name}\` must be a string.`, success: false };
            collection.documents.set(document.id, document);
            return { success: true };
          });
          return answer(response, 200, lines.map((line) => JSON.stringify(line)).join('\n'));
        }
        case 'GET /aliases/:':
          return aliases.has(parts[1]) ? answer(response, 200, { name: parts[1], collection_name: aliases.get(parts[1]) }) : answer(response, 404, { message: 'Not Found' });
        case 'PUT /aliases/:': {
          const { collection_name: target } = JSON.parse(body);
          if (!collections.has(target)) return answer(response, 404, { message: 'Collection not found.' });
          aliases.set(parts[1], target);
          return answer(response, 200, { name: parts[1], collection_name: target });
        }
        case 'POST /keys': {
          const made = JSON.parse(body);
          if (keys.some((one) => one.value === made.value)) return answer(response, 409, { message: 'API key generation conflict.' });
          keys.push({ ...made, id: keys.length });
          return answer(response, 201, { ...made, id: keys.length - 1 });
        }
        default:
          return answer(response, 404, { message: 'Not Found' });
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    server,
    key,
    url: `http://127.0.0.1:${server.address().port}`,
    collections,
    aliases,
    keys,
    refuse,
    // The documents the alias `name` leads to, by id, or null.
    documentsOf: (name) => (aliases.has(name) ? Object.fromEntries(collections.get(aliases.get(name)).documents) : null),
    close: () => new Promise((done) => server.close(done)),
  })));
}
