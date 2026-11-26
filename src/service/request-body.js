// A request's body as the service reads it, in either role: up to `limit` bytes, or null when it is
// longer, the rest left unread; and the answer to a body too long.

export function bodyOf(incoming, limit) {
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

// How long a connection stays open after a body too long was refused, for the client to send the
// rest: long enough for a client near the service, such as the web server, to send what it had
// begun, and short enough that one that sends slowly holds nothing open for long.
const LINGER = 2000;

// Answers a request whose body is too long `413`, as JSON with nothing in it, and closes its
// connection after the answer, once the client has sent the rest, which is thrown away unread, or
// LINGER after, whichever comes first. A connection closed while the client is still sending is
// reset, and a client that has not yet read the answer then reads none.
export function refuseTooLarge(incoming, outgoing) {
  outgoing.shouldKeepAlive = false;
  outgoing.writeHead(413, { 'content-type': 'application/json; charset=utf-8', 'content-length': 2, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  outgoing.write('{}');
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    outgoing.end();
  };
  const timer = setTimeout(end, LINGER);
  timer.unref();
  for (const event of ['end', 'close', 'error']) incoming.on(event, end);
  incoming.resume();
  if (incoming.readableEnded) end();
}
