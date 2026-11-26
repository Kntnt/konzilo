// A stand-in for another site's feeds, in a container of its own in a site's Compose project, so
// that the feed reader reaches no outside address: each file in /stand-in/feeds/ by its name, as
// RSS or Atom by its extension, or with the status a file that holds `STATUS <code>` names. Each
// request is noted in /stand-in/asked.log, so that a test can tell that nothing was read.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

createServer((incoming, outgoing) => {
  const name = new URL(incoming.url, 'http://stand-in').pathname.slice(1);
  appendFileSync('/stand-in/asked.log', `${name}\n`);
  const file = `/stand-in/feeds/${name}`;
  if (!/^[\w.-]+$/.test(name) || !existsSync(file)) {
    outgoing.writeHead(404);
    return outgoing.end();
  }
  const text = readFileSync(file, 'utf8');
  const status = /^STATUS (\d{3})/.exec(text);
  if (status) {
    outgoing.writeHead(Number(status[1]));
    return outgoing.end();
  }
  outgoing.writeHead(200, { 'content-type': name.endsWith('.atom') ? 'application/atom+xml; charset=utf-8' : 'application/rss+xml; charset=utf-8' });
  return outgoing.end(text);
}).listen(8080);
