// How the service in its role for editors answers (ADR 0044), each answer `no-store` and
// `nosniff`: JSON; a file written a piece at a time; a method a path does not take; anyone but an
// Admin on an Admin's page; and a request's JSON body, read up to the most it may be.

import { bodyOf, refuseTooLarge } from './request-body.js';

const KEPT_NOWHERE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

export const answerJson = (outgoing, status, body) => {
  outgoing.writeHead(status, { 'content-type': 'application/json', ...KEPT_NOWHERE });
  outgoing.end(JSON.stringify(body));
};

// A method the path does not take: 405, naming `methods`, those it takes, the body left unread.
export function answerMethods(incoming, outgoing, methods) {
  incoming.resume();
  outgoing.writeHead(405, { allow: methods.join(', '), 'content-type': 'application/json', ...KEPT_NOWHERE });
  outgoing.end('{}');
}

// Whether the one asking may use the Admin's pages, by `adminOf(credential)`: true, false for one
// who may write and is no Admin, or null for whoever may not write. Anyone but an Admin is
// answered, the body left unread: one who may write is told only that the page is an Admin's,
// 403, and whoever may not write nothing, 401.
export async function asAdmin(incoming, outgoing, adminOf) {
  const admin = await adminOf(incoming.headers.authorization);
  if (admin === true) return true;
  incoming.resume();
  answerJson(outgoing, admin === null ? 401 : 403, {});
  return false;
}

// A request's JSON, of at most `limit` bytes, or undefined where it was answered already: 415 for
// a body of another type, 413 for one longer, by the length it declares or as it is read, and 400
// for one that is no JSON, as a problem of the whole.
export async function jsonOf(incoming, outgoing, limit) {
  if ((incoming.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    incoming.resume();
    answerJson(outgoing, 415, {});
    return undefined;
  }
  const body = Number(incoming.headers['content-length'] ?? 0) > limit ? null : await bodyOf(incoming, limit);
  if (body === null) {
    refuseTooLarge(incoming, outgoing);
    return undefined;
  }
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    answerJson(outgoing, 400, { problems: { '': 'malformed' } });
    return undefined;
  }
}

// Until an answer has room for more, or is gone.
const drained = (outgoing) => new Promise((go) => {
  const goOn = () => {
    outgoing.off('drain', goOn);
    outgoing.off('close', goOn);
    go();
  };
  outgoing.on('drain', goOn);
  outgoing.on('close', goOn);
});

// A file, `name`.csv, written a piece at a time, as `pieces`, an iterator, gives them, never held
// whole. Its first piece is read before anything is answered, so that what breaks while the store
// is first read is a 500; what breaks after it ends the answer unfinished, which a browser reports
// as a failed download rather than keep a file cut short. Either is said by `warn`, the service's
// log.
export async function answerCsv(outgoing, name, pieces, warn = console.error) {
  const broke = (error) => warn(`The service could not write ${name}.csv: ${error.stack ?? error.message}`);
  let piece;
  try {
    piece = pieces.next();
  } catch (error) {
    broke(error);
    return answerJson(outgoing, 500, {});
  }
  outgoing.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8; header=present',
    'content-disposition': `attachment; filename="${name}.csv"`,
    ...KEPT_NOWHERE,
  });
  try {
    for (; !piece.done; piece = pieces.next()) {
      if (outgoing.destroyed) return undefined;
      if (!outgoing.write(piece.value)) await drained(outgoing);
    }
    outgoing.end();
  } catch (error) {
    broke(error);
    outgoing.destroy();
  } finally {
    pieces.return();
  }
  return undefined;
}
