// The SMTP adapter (ADR 0003): hands a message to the mail server an Admin names, as a mail
// provider's submission port takes one, with Node's own sockets. It encrypts by STARTTLS, which it
// never goes on without where it was asked for, or from the first byte, or not at all; it signs in
// with PLAIN or LOGIN, and only on an encrypted connection; and it checks the server's certificate
// as a browser would.

import { connect as connectPlain, isIP } from 'node:net';
import { connect as connectTls } from 'node:tls';

// What an Admin may choose, and the port each takes by default.
export const SECURITIES = Object.freeze({ starttls: 587, tls: 465, none: 25 });

// How long the server may take over any one answer.
const ANSWER_WITHIN = 30_000;
// What of a server's answer is said where it is refused: enough to tell why.
const SAID_AT_MOST = 200;

// An answer refused, with what the server said.
class Refused extends Error {}

// The server's answers on a socket, each whole, its lines joined: { code, text }.
function answers(socket, timeout) {
  let buffer = '';
  let lines = [];
  const ready = [];
  const waiting = [];
  let broken = null;
  const settle = () => {
    while (waiting.length > 0 && (ready.length > 0 || broken)) {
      const { resolve, reject } = waiting.shift();
      if (ready.length > 0) resolve(ready.shift());
      else reject(broken);
    }
  };
  const onData = (chunk) => {
    buffer += chunk.toString('utf8');
    for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at).replace(/\r$/, '');
      buffer = buffer.slice(at + 1);
      lines.push(line.slice(4));
      if (line.length < 4 || line[3] !== '-') {
        ready.push({ code: Number(line.slice(0, 3)), text: lines.join(' ').trim() });
        lines = [];
      }
    }
    settle();
  };
  const onEnd = (error) => {
    broken ??= error instanceof Error ? error : new Error('the server closed the connection');
    settle();
  };
  socket.on('data', onData);
  socket.on('error', onEnd);
  socket.on('close', () => onEnd());
  socket.setTimeout(timeout, () => {
    onEnd(new Error('the server did not answer in time'));
    socket.destroy();
  });
  return {
    next: () => new Promise((resolve, reject) => {
      waiting.push({ resolve, reject });
      settle();
    }),
    // What the socket is given to once it is encrypted, which reads on in its place.
    release() {
      socket.off('data', onData);
      socket.off('error', onEnd);
      socket.removeAllListeners('close');
      socket.setTimeout(0);
    },
  };
}

const opened = (socket, event) => new Promise((resolve, reject) => {
  socket.once(event, resolve);
  socket.once('error', reject);
});

// Sends `data`, a message whole, its lines ended by CRLF, from `from` to each of `to`, through the
// server `host` at `port`: `security` one of SECURITIES, and `username` and `password` where it
// signs in. `tls`: what the check of the server's certificate is given beside its name, such as a
// test's own `ca`. Gives { refused }, the recipients the server refused, where it took the message
// for one at least; throws, saying why, where it took it for none.
export async function sendBySmtp({ host, port, security, username = '', password = '' }, { from, to, data }, { tls = {}, timeout = ANSWER_WITHIN } = {}) {
  const servername = isIP(host) ? undefined : host;
  const encrypt = (options) => connectTls({ ...tls, ...options, servername });
  let socket = security === 'tls' ? encrypt({ host, port }) : connectPlain({ host, port });
  await opened(socket, security === 'tls' ? 'secureConnect' : 'connect');
  let read = answers(socket, timeout);
  const said = ({ code, text }) => `${code} ${text}`.slice(0, SAID_AT_MOST);
  const expect = async (what, ...codes) => {
    const answer = await read.next();
    if (!codes.includes(answer.code)) throw new Refused(`${host} answered ${said(answer)} to ${what}`);
    return answer;
  };
  const ask = (line, what, ...codes) => {
    socket.write(`${line}\r\n`);
    return expect(what, ...codes);
  };
  // The name it greets by: the sender's domain, which is the one thing of its own it knows.
  const greeting = `EHLO ${from.split('@').at(-1)}`;
  const offers = ({ text }) => text.toUpperCase().split(' ');

  try {
    await expect('the connection', 220);
    let offered = offers(await ask(greeting, 'the greeting', 250));
    if (security === 'starttls') {
      if (!offered.includes('STARTTLS')) throw new Refused(`${host} offers no STARTTLS`);
      await ask('STARTTLS', 'STARTTLS', 220);
      read.release();
      socket = encrypt({ socket });
      await opened(socket, 'secureConnect');
      read = answers(socket, timeout);
      offered = offers(await ask(greeting, 'the greeting', 250));
    }
    if (username !== '') {
      if (security === 'none') throw new Refused('a password is sent only on an encrypted connection');
      const at = offered.indexOf('AUTH');
      const mechanisms = at < 0 ? [] : offered.slice(at + 1);
      if (mechanisms.includes('PLAIN')) {
        await ask(`AUTH PLAIN ${Buffer.from(`\0${username}\0${password}`).toString('base64')}`, 'signing in', 235);
      } else if (mechanisms.includes('LOGIN')) {
        await ask('AUTH LOGIN', 'signing in', 334);
        await ask(Buffer.from(username).toString('base64'), 'signing in', 334);
        await ask(Buffer.from(password).toString('base64'), 'signing in', 235);
      } else {
        throw new Refused(`${host} offers no way of signing in that the service knows`);
      }
    }
    await ask(`MAIL FROM:<${from}>`, 'the sender', 250);
    const refused = [];
    let last = null;
    for (const recipient of to) {
      socket.write(`RCPT TO:<${recipient}>\r\n`);
      const answer = await read.next();
      if (answer.code === 250 || answer.code === 251) continue;
      refused.push(recipient);
      last = answer;
    }
    if (refused.length === to.length) throw new Refused(`${host} answered ${said(last)} to every recipient`);
    await ask('DATA', 'the message', 354);
    const body = data.endsWith('\r\n') ? data : `${data}\r\n`;
    socket.write(`${body.replace(/^\./gm, '..')}.\r\n`);
    await expect('the message', 250);
    socket.write('QUIT\r\n');
    await read.next().catch(() => null);
    return { refused };
  } finally {
    socket.destroy();
  }
}
