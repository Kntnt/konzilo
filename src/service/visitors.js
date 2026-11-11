// The service, in its role for visitors (ADR 0044): what visitors' browsers send below /_konzilo/,
// which the web server passes on, each request to the kind the core registers for its path. A
// kind takes the requests to its path and every path below it, with the methods, the types and up
// to the size it declares; the service refuses the rest before the kind sees it, answers every
// request `no-store` and `nosniff`, and never sets a cookie.
//
// A kind is told of the visitor only what it may make of the request: whether it came from a page
// of the site's own, and a keyed digest of the visitor's address in a window of ten minutes, with
// the window's end, which counts one client and is gone with its window. The address itself, and
// whatever else would tell one visitor from another, reaches no kind, and nothing of the request
// is logged.

import { createHmac } from 'node:crypto';

import { formsKind } from './forms.js';

// The headers the web server passes on beside the browser's own (compose/web/Caddyfile, and
// src/astro/reserved.js locally): the visitor's address, and the host the request came to.
const CLIENT = 'x-konzilo-client';
const HOST = 'x-konzilo-host';

// A client is counted in windows of ten minutes.
const WINDOW = 10 * 60 * 1000;

// A header as the web server passes it on, where one it was not sent is empty: null for none.
const header = (headers, name) => {
  const value = headers[name];
  return typeof value === 'string' && value !== '' ? value : null;
};

const hostOf = (address) => {
  try {
    return new URL(address).host.toLowerCase();
  } catch {
    return null;
  }
};

// Whether a request came from a page of the site's own: `Sec-Fetch-Site: same-origin`, or, from a
// browser that sends no such header, an `Origin`, or else a `Referer`, on the host the request
// came to or on one of the site's public `hosts`.
export function fromSite(headers, hosts) {
  const site = header(headers, 'sec-fetch-site');
  if (site !== null) return site === 'same-origin';
  const from = header(headers, 'origin') ?? header(headers, 'referer');
  if (from === null) return false;
  const host = hostOf(from);
  const own = [header(headers, HOST), ...hosts].filter(Boolean).map((one) => one.toLowerCase());
  return host !== null && own.includes(host);
}

// The answer to a request, as a kind gives it: { status, json } or { status: 303, location }, with
// `retryAfter`, in seconds, for a 429.
function write(outgoing, { status, json = {}, location = null, retryAfter = null, allow = null }) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (retryAfter !== null) headers['retry-after'] = String(retryAfter);
  if (allow !== null) headers.allow = allow;
  if (location !== null) {
    outgoing.writeHead(status, { ...headers, location, 'content-length': 0 });
    return outgoing.end();
  }
  const body = JSON.stringify(json);
  outgoing.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  return outgoing.end(body);
}

// A body up to `limit` bytes, or null when it is longer.
function bodyOf(incoming, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    incoming.on('data', (chunk) => {
      length += chunk.length;
      if (length > limit) {
        incoming.removeAllListeners('data');
        incoming.resume();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    incoming.on('end', () => resolve(Buffer.concat(chunks)));
    incoming.on('error', reject);
  });
}

// The service for visitors. `site()`: the site description of the code in use, as checked.
// `store`: as store.js opens it. `hosts`: the site's public hosts, each a host with its port where
// it has one. `now()`: the moment.
//
// Gives { request(incoming, outgoing) }, which answers one request.
export function visitorsService({ site, store, hosts = [], now = () => new Date() }) {
  const kinds = [formsKind({ site, store, now })];
  const clientKey = createHmac('sha256', store.key).update('clients').digest();

  // The client a request came from, in the window it came in: its digest and the window's end.
  const clientOf = (headers) => {
    const window = Math.floor(now().getTime() / WINDOW);
    const digest = createHmac('sha256', clientKey).update(`${window}\n${header(headers, CLIENT) ?? ''}`).digest('base64url');
    return { digest, ends: new Date((window + 1) * WINDOW) };
  };

  return {
    async request(incoming, outgoing) {
      const url = new URL(incoming.url, 'http://service');
      if (url.pathname === '/health') return write(outgoing, { status: 200, json: { ok: true } });
      const kind = kinds.find(({ path }) => url.pathname === path || url.pathname.startsWith(`${path}/`));
      if (!kind) {
        incoming.resume();
        return write(outgoing, { status: 404 });
      }
      if (!kind.methods.includes(incoming.method)) {
        incoming.resume();
        return write(outgoing, { status: 405, allow: kind.methods.join(', ') });
      }
      let type = null;
      let body = null;
      // A body comes with a POST, the one method with a body that any kind takes.
      if (incoming.method === 'POST') {
        type = (header(incoming.headers, 'content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!kind.types.includes(type)) {
          incoming.resume();
          return write(outgoing, { status: 415 });
        }
        const declared = Number(header(incoming.headers, 'content-length') ?? 0);
        if (declared > kind.limit) {
          outgoing.shouldKeepAlive = false;
          return write(outgoing, { status: 413 });
        }
        body = await bodyOf(incoming, kind.limit);
        if (body === null) {
          outgoing.shouldKeepAlive = false;
          return write(outgoing, { status: 413 });
        }
      } else {
        incoming.resume();
      }
      const answer = await kind.take({
        method: incoming.method,
        below: url.pathname.slice(kind.path.length),
        type,
        body,
        fromSite: fromSite(incoming.headers, hosts),
        client: clientOf(incoming.headers),
      });
      return write(outgoing, answer);
    },
  };
}
