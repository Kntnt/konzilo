// Loaded into a command with `node --import`: every way out to the network
// fails and is named on standard error, so a test can tell that the command
// tried none. Every TCP connection, TLS and Node's fetch included, starts as
// a socket's connect; names are looked up through dns.

import dns from 'node:dns';
import net from 'node:net';

function refuse(what) {
  return () => {
    process.stderr.write(`network: ${what}\n`);
    throw new Error(`no network in this test: ${what}`);
  };
}

net.Socket.prototype.connect = refuse('a socket connected');
for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  dns[name] = refuse(`dns.${name}`);
  dns.promises[name] = refuse(`dns.promises.${name}`);
}
globalThis.fetch = refuse('fetch');
