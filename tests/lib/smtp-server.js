// A mail server for the tests, on this machine alone, that speaks as much SMTP as a mail
// provider's submission port does and keeps what it is given: EHLO, STARTTLS, or TLS from the
// first byte, AUTH PLAIN and LOGIN, MAIL, RCPT, DATA and QUIT. Nothing it takes goes anywhere.

import { createServer as createPlainServer } from 'node:net';
import { createServer as createTlsServer, TLSSocket } from 'node:tls';

// `tls`: { key, cert }, for STARTTLS, or for TLS from the start with `implicit`. `starttls`:
// whether it offers STARTTLS where it has `tls`. `account`: { username, password } that AUTH takes,
// offered only once the connection is encrypted where it can be. `refuse`: recipients it refuses.
// `answer(command)`: an answer of its own to a command, such as '421 Busy', in place of its own, or
// false for none at all.
//
// Gives { port, received, commands, close() }: `received` each message, { from, to, data, secure,
// signedIn }; `commands` each line a client sent, a password left out.
export async function smtpServer({ tls = null, implicit = false, starttls = true, account = null, refuse = [], answer = () => null } = {}) {
  const received = [];
  const commands = [];
  const sockets = new Set();

  const converse = (first, secureFromStart) => {
    let socket = first;
    let secure = secureFromStart;
    let signedIn = false;
    let envelope = { from: null, to: [] };
    let reading = null;
    let buffer = '';
    const say = (line) => socket.write(`${line}\r\n`);

    const offers = () => [
      ...(tls && !secure && starttls ? ['STARTTLS'] : []),
      ...(account && (secure || !tls) ? ['AUTH PLAIN LOGIN'] : []),
      'SIZE 10485760',
      '8BITMIME',
    ];

    const line = (text) => {
      if (reading) {
        if (text === '.') {
          received.push({ ...envelope, data: reading.join('\r\n'), secure, signedIn });
          reading = null;
          envelope = { from: null, to: [] };
          return say('250 Kept');
        }
        reading.push(text.startsWith('.') ? text.slice(1) : text);
        return null;
      }
      const [verb] = text.split(' ');
      const command = verb.toUpperCase();
      commands.push(command === 'AUTH' ? text.replace(/^(AUTH \S+).*$/i, '$1') : text);
      const own = answer(text);
      if (own === false) return null;
      if (own) return say(own);
      switch (command) {
        case 'EHLO': {
          const lines = ['localhost', ...offers()];
          lines.forEach((one, at) => say(`250${at < lines.length - 1 ? '-' : ' '}${one}`));
          return null;
        }
        case 'STARTTLS': {
          if (!tls || secure) return say('503 Not now');
          say('220 Go ahead');
          socket.removeAllListeners('data');
          const upgraded = new TLSSocket(socket, { isServer: true, ...tls });
          upgraded.on('error', () => upgraded.destroy());
          upgraded.on('data', onData);
          socket = upgraded;
          secure = true;
          return null;
        }
        case 'AUTH': {
          const [, mechanism, given] = text.split(' ');
          if (!account) return say('502 No sign-in here');
          if (mechanism.toUpperCase() === 'PLAIN') {
            const [, username, password] = Buffer.from(given ?? '', 'base64').toString().split('\0');
            signedIn = username === account.username && password === account.password;
            return say(signedIn ? '235 Signed in' : '535 Wrong');
          }
          if (mechanism.toUpperCase() === 'LOGIN') {
            reading = null;
            const steps = [];
            pending = (reply) => {
              steps.push(Buffer.from(reply, 'base64').toString());
              if (steps.length === 1) return say('334 UGFzc3dvcmQ6');
              pending = null;
              signedIn = steps[0] === account.username && steps[1] === account.password;
              return say(signedIn ? '235 Signed in' : '535 Wrong');
            };
            return say('334 VXNlcm5hbWU6');
          }
          return say('504 Unknown');
        }
        case 'MAIL':
          if (account && !signedIn) return say('530 Sign in first');
          envelope = { from: /<([^>]*)>/.exec(text)?.[1] ?? null, to: [] };
          return say('250 OK');
        case 'RCPT': {
          const to = /<([^>]*)>/.exec(text)?.[1] ?? '';
          if (refuse.includes(to)) return say('550 No such mailbox');
          envelope.to.push(to);
          return say('250 OK');
        }
        case 'DATA':
          if (envelope.to.length === 0) return say('554 No recipients');
          reading = [];
          return say('354 Go on');
        case 'RSET':
          envelope = { from: null, to: [] };
          return say('250 OK');
        case 'QUIT':
          say('221 Bye');
          return socket.end();
        default:
          return say('502 Unknown');
      }
    };
    let pending = null;

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      for (let at = buffer.indexOf('\r\n'); at >= 0; at = buffer.indexOf('\r\n')) {
        const text = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (pending && !reading) {
          commands.push('(a step of signing in)');
          pending(text);
        } else {
          line(text);
        }
      }
    }
    socket.on('data', onData);
    socket.on('error', () => socket.destroy());
    say('220 localhost ready');
  };

  const server = implicit
    ? createTlsServer(tls, (socket) => {
      sockets.add(socket);
      converse(socket, true);
    })
    : createPlainServer((socket) => {
      sockets.add(socket);
      converse(socket, false);
    });
  await new Promise((go) => server.listen(0, '127.0.0.1', go));
  return {
    port: server.address().port,
    received,
    commands,
    close: () => {
      for (const socket of sockets) socket.destroy();
      return new Promise((go) => server.close(go));
    },
  };
}
