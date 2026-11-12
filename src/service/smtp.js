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

// Why a mail could not be handed over, by its kind, which the *Mail* page names in the interface
// language, with `reply`, the server's answer, its code and its text, where it gave one, and nothing
// else of the server's or of Node's: those words are the service's log's, in English.
//   unreachable    no connection to the server
//   timeout        the server took too long over an answer
//   closed         the server ended the connection
//   certificate    the server's certificate cannot be trusted
//   encryption     the connection could not be encrypted
//   no-starttls    STARTTLS was chosen, and the server offers none
//   no-sign-in     the server offers no way of signing in the service knows
//   unencrypted    a password would have gone unencrypted
//   greeting       the server refused the connection or its greeting (reply)
//   starttls       the server refused to encrypt the connection (reply)
//   sign-in        the server refused the username or the password (reply)
//   sender         the server refused the sender's address (reply)
//   recipients     the server refused every recipient (reply)
//   message        the server refused the message (reply)
//   other          anything else
export class MailFailure extends Error {
  constructor(kind, message, { reply = null, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.kind = kind;
    this.reply = reply;
  }
}

// What Node's own errors say of a connection, by their codes.
const UNREACHABLE = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EHOSTDOWN', 'EADDRNOTAVAIL', 'ETIMEDOUT']);
const CLOSED = new Set(['ECONNRESET', 'EPIPE']);
const CERTIFICATE = /CERT|ALTNAME|HOSTNAME_MISMATCH|INVALID_CA|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|PATH_LENGTH/;
const ENCRYPTION = /^ERR_SSL|^ERR_TLS|^EPROTO$/;

// Any error a send ends with, as a MailFailure.
function failureOf(error) {
  if (error instanceof MailFailure) return error;
  const code = typeof error?.code === 'string' ? error.code : '';
  const kind = UNREACHABLE.has(code) ? 'unreachable' : CLOSED.has(code) ? 'closed' : CERTIFICATE.test(code) ? 'certificate' : ENCRYPTION.test(code) ? 'encryption' : 'other';
  return new MailFailure(kind, error?.message ?? String(error), { cause: error });
}

// The server's answers on a socket, each whole, its lines joined: { code, text }. Whatever ends the
// socket, an error, a close or the time running out, rejects the answer waited for, and each after.
function answers(socket) {
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
    broken ??= error instanceof Error ? error : new MailFailure('closed', 'the server closed the connection');
    settle();
  };
  socket.on('data', onData);
  socket.on('error', onEnd);
  socket.on('close', onEnd);
  return {
    next: () => new Promise((resolve, reject) => {
      waiting.push({ resolve, reject });
      settle();
    }),
    // What the socket is given to once it is encrypted, which reads on in its place.
    release() {
      socket.off('data', onData);
      socket.off('error', onEnd);
      socket.off('close', onEnd);
    },
  };
}

// A socket that ends with an error where the server takes longer than `timeout` over anything,
// connecting among it, opened: once it is connected, or encrypted where it is to be.
function opening(socket, event, timeout) {
  socket.setTimeout(timeout, () => socket.destroy(new MailFailure('timeout', 'the server did not answer in time')));
  return new Promise((resolve, reject) => {
    socket.once(event, resolve);
    socket.once('error', reject);
  });
}

// Sends `data`, a message whole, its lines ended by CRLF, from `from` to each of `to`, through the
// server `host` at `port`: `security` one of SECURITIES, and `username` and `password` where it
// signs in. `tls`: what the check of the server's certificate is given beside its name, such as a
// test's own `ca`. Gives { refused }, the recipients the server refused, where it took the message
// for one at least; throws a MailFailure, saying why, where it took it for none.
export async function sendBySmtp({ host, port, security, username = '', password = '' }, { from, to, data }, { tls = {}, timeout = ANSWER_WITHIN } = {}) {
  const servername = isIP(host) ? undefined : host;
  const encrypt = (options) => connectTls({ ...tls, ...options, servername });
  let socket = security === 'tls' ? encrypt({ host, port }) : connectPlain({ host, port });
  let read = null;
  const said = ({ code, text }) => `${code} ${text}`.slice(0, SAID_AT_MOST);
  // An answer to `what`, of `kind` where it is none of `codes`, which the server refused.
  const expect = async (kind, what, ...codes) => {
    const answer = await read.next();
    if (!codes.includes(answer.code)) throw new MailFailure(kind, `${host} answered ${said(answer)} to ${what}`, { reply: said(answer) });
    return answer;
  };
  const ask = (line, kind, what, ...codes) => {
    socket.write(`${line}\r\n`);
    return expect(kind, what, ...codes);
  };
  // The name it greets by: the sender's domain, which is the one thing of its own it knows.
  const greeting = `EHLO ${from.split('@').at(-1)}`;
  const offers = ({ text }) => text.toUpperCase().split(' ');

  try {
    await opening(socket, security === 'tls' ? 'secureConnect' : 'connect', timeout);
    read = answers(socket);
    await expect('greeting', 'the connection', 220);
    let offered = offers(await ask(greeting, 'greeting', 'the greeting', 250));
    if (security === 'starttls') {
      if (!offered.includes('STARTTLS')) throw new MailFailure('no-starttls', `${host} offers no STARTTLS`);
      await ask('STARTTLS', 'starttls', 'STARTTLS', 220);
      read.release();
      socket.setTimeout(0);
      socket = encrypt({ socket });
      await opening(socket, 'secureConnect', timeout);
      read = answers(socket);
      offered = offers(await ask(greeting, 'greeting', 'the greeting', 250));
    }
    if (username !== '') {
      if (security === 'none') throw new MailFailure('unencrypted', 'a password is sent only on an encrypted connection');
      const at = offered.indexOf('AUTH');
      const mechanisms = at < 0 ? [] : offered.slice(at + 1);
      if (mechanisms.includes('PLAIN')) {
        await ask(`AUTH PLAIN ${Buffer.from(`\0${username}\0${password}`).toString('base64')}`, 'sign-in', 'signing in', 235);
      } else if (mechanisms.includes('LOGIN')) {
        await ask('AUTH LOGIN', 'sign-in', 'signing in', 334);
        await ask(Buffer.from(username).toString('base64'), 'sign-in', 'signing in', 334);
        await ask(Buffer.from(password).toString('base64'), 'sign-in', 'signing in', 235);
      } else {
        throw new MailFailure('no-sign-in', `${host} offers no way of signing in that the service knows`);
      }
    }
    await ask(`MAIL FROM:<${from}>`, 'sender', 'the sender', 250);
    const refused = [];
    let last = null;
    for (const recipient of to) {
      socket.write(`RCPT TO:<${recipient}>\r\n`);
      const answer = await read.next();
      if (answer.code === 250 || answer.code === 251) continue;
      refused.push(recipient);
      last = answer;
    }
    if (refused.length === to.length) throw new MailFailure('recipients', `${host} answered ${said(last)} to every recipient`, { reply: said(last) });
    await ask('DATA', 'message', 'the message', 354);
    const body = data.endsWith('\r\n') ? data : `${data}\r\n`;
    socket.write(`${body.replace(/^\./gm, '..')}.\r\n`);
    await expect('message', 'the message', 250);
    socket.write('QUIT\r\n');
    await read.next().catch(() => null);
    return { refused };
  } catch (error) {
    throw failureOf(error);
  } finally {
    socket.destroy();
  }
}
