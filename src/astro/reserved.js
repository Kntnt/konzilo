// The reserved paths below /_konzilo/: the site's services answer there, on the
// public host and its pre-launch address, and no page of the site may lie
// there. Online, the web server passes the paths to the services and never looks
// for a file; a build that would write one there fails, naming it. Locally,
// Astro's dev server is the public host, and passes the paths to the site's
// endpoint, which KONZILO_ENDPOINT names, as the web server does online.
//
// The core's own file below the prefix is the exception: the page that says a
// form's message was not sent, which the web server serves only in place of its
// own error when the endpoint does not answer a form, as the dev server does
// here.

import { readdirSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESERVED_PREFIX } from '../site-description.js';
import { FORM_NOT_SENT, FORMS_PATH } from './forms.js';

// The core's own files below the prefix, by their addresses.
const CORE_FILES = [`/${FORM_NOT_SENT}`];

// What a server in front of the endpoint answers when the endpoint does not
// answer it.
const NOT_ANSWERED = [502, 503, 504];

// The addresses of what a build wrote below the prefix, in order, but the
// core's own files: a page's address for a page, written as
// <path>/index.html, and a file's own for any other file.
export function reservedPages(dir) {
  const folder = join(fileURLToPath(dir), RESERVED_PREFIX);
  const found = [];
  const walk = (path, address) => {
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(join(path, entry.name), `${address}${entry.name}/`);
      else found.push(entry.name === 'index.html' ? address : `${address}${entry.name}`);
    }
  };
  walk(folder, RESERVED_PREFIX);
  return found.filter((address) => !CORE_FILES.includes(address)).sort();
}

// Fail the build when it wrote anything below the prefix.
export function refuseReservedPages(dir) {
  const pages = reservedPages(dir);
  if (pages.length > 0) {
    throw new Error(`the build has pages below ${RESERVED_PREFIX}, where the site's services answer: ${pages.join(', ')}; give each another address`);
  }
}

// What the endpoint is told of a request, beside its method, path and query:
// its body's type and length, and where it came from, which the endpoint
// reads to tell whether it came from the site's own pages and keeps from
// every kind. No other header goes on: no cookie, browser,
// password or language. Caddy passes the same.
const PASSED = ['content-type', 'content-length', 'origin', 'referer', 'sec-fetch-site'];

// The dev server's own headers to the endpoint, which nginx hands on as
// Caddy does online: the visitor's address, of which the endpoint keeps no
// more than a keyed digest for ten minutes, and the public host the request
// came to. A visitor's own headers of these names never pass.
const CLIENT = 'x-konzilo-client';
const HOST = 'x-konzilo-host';

// What the endpoint's answer loses on the way back: what holds between two
// hops alone.
const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-authenticate', 'proxy-connection'];

// The dev server's middleware: every request below the prefix, but for a
// file of the core's own, goes to the endpoint at `target`, an origin such
// as http://127.0.0.1, and its answer comes back as it is. Without an
// endpoint, or when it does not answer, the request gets 502, which the
// site's pages never wait for; one below /_konzilo/forms/ gets the page
// that says the form's message was not sent, from `notSent()`, as the web
// server gives it online, also when a server in front of the endpoint says that
// it does not answer.
export function endpointProxy(target = process.env.KONZILO_ENDPOINT, { notSent = null } = {}) {
  return (incoming, outgoing, next) => {
    if (!incoming.url.startsWith(RESERVED_PREFIX)) return next();
    if (CORE_FILES.includes(new URL(incoming.url, 'http://dev').pathname)) return next();
    const form = notSent !== null && incoming.url.startsWith(FORMS_PATH);
    const fail = (why) => {
      const page = form ? notSent() : `${why}\n`;
      outgoing.writeHead(502, { 'Content-Type': `text/${form ? 'html' : 'plain'}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      outgoing.end(page);
    };
    if (!target) return fail('This dev server has no endpoint: KONZILO_ENDPOINT names none.');
    const headers = Object.fromEntries(PASSED.filter((name) => incoming.headers[name] !== undefined).map((name) => [name, incoming.headers[name]]));
    headers[CLIENT] = incoming.socket.remoteAddress ?? '';
    headers[HOST] = incoming.headers.host ?? '';
    const forward = request(new URL(incoming.url, target), { method: incoming.method, headers, agent: false }, (answer) => {
      if (form && NOT_ANSWERED.includes(answer.statusCode)) {
        answer.resume();
        return fail('');
      }
      const kept = Object.fromEntries(Object.entries(answer.headers).filter(([name]) => !HOP_BY_HOP.includes(name)));
      outgoing.writeHead(answer.statusCode, kept);
      answer.pipe(outgoing);
    });
    forward.on('error', () => {
      if (outgoing.headersSent) outgoing.destroy();
      else fail("The site's endpoint does not answer.");
    });
    incoming.pipe(forward);
  };
}
