// The SMTP adapter (ADR 0003): a message handed to a mail server as a provider's submission port
// takes it, encrypted by STARTTLS or from the first byte, signed in where an account is given,
// against a server of the test's own on this machine, which keeps what it is given.

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { mailDelivery } from '../src/service/mail-delivery.js';
import { sendBySmtp } from '../src/service/smtp.js';
import { smtpServer } from './lib/smtp-server.js';
import { selfSigned } from './lib/tls.js';

const certificate = selfSigned();
const trusted = { ca: [certificate.cert] };
const account = { username: 'site@example.com', password: 'a secret' };
const message = ['From: site@example.com', 'To: anna@example.com', 'Subject: Hello', '', 'One line.', '.A line that starts with a dot.', ''].join('\r\n');
const envelope = { from: 'site@example.com', to: ['anna@example.com'], data: message };

describe('sending by SMTP', () => {
  let server;
  afterEach(() => server?.close());

  test('encrypts by STARTTLS, signs in, and hands the message over whole, a line that starts with a dot among it', async () => {
    server = await smtpServer({ tls: certificate, account });
    await sendBySmtp({ host: 'localhost', port: server.port, security: 'starttls', ...account }, envelope, { tls: trusted });
    assert.equal(server.received.length, 1);
    const [kept] = server.received;
    assert.deepEqual({ from: kept.from, to: kept.to, secure: kept.secure, signedIn: kept.signedIn }, { from: 'site@example.com', to: ['anna@example.com'], secure: true, signedIn: true });
    assert.equal(`${kept.data}\r\n`, message);
    assert.deepEqual(server.commands.map((line) => line.split(/[ :]/)[0]), ['EHLO', 'STARTTLS', 'EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
  });

  test('speaks TLS from the first byte, and signs in by LOGIN where the server offers no PLAIN', async () => {
    server = await smtpServer({ tls: certificate, implicit: true, account, answer: (line) => (/^AUTH PLAIN/i.test(line) ? '504 Not that one' : null) });
    // The test's server offers both, and refuses PLAIN, as one offering LOGIN alone would be met.
    await assert.rejects(sendBySmtp({ host: 'localhost', port: server.port, security: 'tls', ...account }, envelope, { tls: trusted }), /localhost answered 504 Not that one to signing in/);
    await server.close();

    server = await smtpServer({ tls: certificate, implicit: true, account, answer: (line) => (/^EHLO/i.test(line) ? '250-localhost\r\n250 AUTH LOGIN' : null) });
    await sendBySmtp({ host: 'localhost', port: server.port, security: 'tls', ...account }, envelope, { tls: trusted });
    assert.deepEqual(server.received.map(({ secure, signedIn }) => ({ secure, signedIn })), [{ secure: true, signedIn: true }]);
    assert.ok(!server.commands.some((line) => line.includes(account.password) || line.includes(Buffer.from(account.password).toString('base64'))), 'the password in no line kept');
  });

  test('never goes on unencrypted where STARTTLS was asked for and the server offers none, nor with a certificate it cannot trust', async () => {
    server = await smtpServer({ tls: certificate, starttls: false, account });
    await assert.rejects(sendBySmtp({ host: 'localhost', port: server.port, security: 'starttls', ...account }, envelope, { tls: trusted }), /localhost offers no STARTTLS/);
    assert.deepEqual(server.commands.map((line) => line.split(' ')[0]), ['EHLO']);
    await server.close();

    server = await smtpServer({ tls: certificate, account });
    await assert.rejects(sendBySmtp({ host: 'localhost', port: server.port, security: 'starttls', ...account }, envelope), /self-signed|self signed/i);
    assert.ok(!server.commands.some((line) => /^AUTH|^MAIL/.test(line)), 'neither signed in nor sent');
    assert.deepEqual(server.received, []);
  });

  test('sends a password only on an encrypted connection, and nothing where the server refuses it', async () => {
    server = await smtpServer({ account });
    await assert.rejects(sendBySmtp({ host: '127.0.0.1', port: server.port, security: 'none', ...account }, envelope), /a password is sent only on an encrypted connection/);
    assert.ok(!server.commands.some((line) => /^AUTH/.test(line)));
    await server.close();

    server = await smtpServer({ tls: certificate, account });
    await assert.rejects(sendBySmtp({ host: 'localhost', port: server.port, security: 'starttls', username: account.username, password: 'wrong' }, envelope, { tls: trusted }), /localhost answered 535 Wrong to signing in/);
    assert.deepEqual(server.received, []);
  });

  test('sends to a relay unencrypted with no account, and to the recipients the server takes, naming those it refuses', async () => {
    server = await smtpServer({ refuse: ['gone@example.com'] });
    const { refused } = await sendBySmtp({ host: '127.0.0.1', port: server.port, security: 'none' }, { ...envelope, to: ['anna@example.com', 'gone@example.com', 'bo@example.com'] });
    assert.deepEqual(refused, ['gone@example.com']);
    assert.deepEqual(server.received.map(({ to, secure, signedIn }) => ({ to, secure, signedIn })), [{ to: ['anna@example.com', 'bo@example.com'], secure: false, signedIn: false }]);
  });

  test('says why where the server takes the message for no one, or does not answer, or is not there', async () => {
    server = await smtpServer({ refuse: ['gone@example.com'] });
    await assert.rejects(sendBySmtp({ host: '127.0.0.1', port: server.port, security: 'none' }, { ...envelope, to: ['gone@example.com'] }), /127\.0\.0\.1 answered 550 No such mailbox to every recipient/);
    assert.deepEqual(server.received, []);
    await server.close();

    server = await smtpServer({ answer: (line) => (/^MAIL/.test(line) ? '421 Busy, try later' : null) });
    await assert.rejects(sendBySmtp({ host: '127.0.0.1', port: server.port, security: 'none' }, envelope), /127\.0\.0\.1 answered 421 Busy, try later to the sender/);
    await server.close();

    server = await smtpServer({ answer: (line) => (/^DATA/.test(line) ? false : null) });
    await assert.rejects(sendBySmtp({ host: '127.0.0.1', port: server.port, security: 'none' }, envelope, { timeout: 200 }), /did not answer in time/);
    const { port } = server;
    await server.close();
    server = null;
    await assert.rejects(sendBySmtp({ host: '127.0.0.1', port, security: 'none' }, envelope), /ECONNREFUSED/);
  });
});

// A message as a mail program reads it: its headers, unfolded, each encoded word decoded, and its
// body decoded by its transfer encoding.
function readMessage(data) {
  const [head, ...rest] = data.split('\r\n\r\n');
  const headers = {};
  for (const line of head.replace(/\r\n[ \t]/g, ' ').split('\r\n')) {
    const at = line.indexOf(':');
    headers[line.slice(0, at).toLowerCase()] = line.slice(at + 1).trim()
      .replace(/=\?UTF-8\?B\?([^?]*)\?=\s*(?==\?)/gi, '=?UTF-8?B?$1?=')
      .replace(/=\?UTF-8\?B\?([^?]*)\?=/gi, (_, words) => Buffer.from(words, 'base64').toString('utf8'));
  }
  const body = rest.join('\r\n\r\n');
  return { headers, body: headers['content-transfer-encoding'] === 'base64' ? Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8') : body, raw: body };
}

describe('a mail handed to its adapter', () => {
  let server;
  afterEach(() => server?.close());

  const mail = {
    from: 'site@example.com',
    to: ['anna@example.com', 'bo@example.com'],
    replyTo: 'ada@example.com',
    subject: 'Nytt inskick: Kontakta oss – ett formulär med ett långt namn som tar mer än en rad i ett huvud',
    language: 'sv-SE',
    date: new Date('2026-11-12T09:59:50Z'),
    text: 'Det här skickades med formuläret Kontakta oss.\n\nMeddelande\nHej\n.och hå\n',
  };
  const settings = (port, security = 'starttls') => ({ adapter: 'smtp', smtp: { host: 'localhost', port, security, ...account, sender: 'site@example.com' } });

  test('goes by SMTP as UTF-8 that a mail program reads, answering to the visitor, dated when it was sent, in its language, as sent by a program', async () => {
    server = await smtpServer({ tls: certificate, account });
    const deliver = mailDelivery({ tls: trusted });
    assert.deepEqual(await deliver(settings(server.port), mail), { refused: [] });
    const [kept] = server.received;
    assert.deepEqual([kept.from, kept.to], ['site@example.com', ['anna@example.com', 'bo@example.com']]);
    assert.ok(kept.data.split('\r\n').every((line) => line.length <= 78 && /^[\x20-\x7e]*$/.test(line)), 'lines of printable ASCII, none too long');
    const { headers, body } = readMessage(kept.data);
    assert.equal(headers.from, 'site@example.com');
    assert.equal(headers.to, 'anna@example.com, bo@example.com');
    assert.equal(headers['reply-to'], 'ada@example.com');
    assert.equal(headers.subject, mail.subject);
    assert.equal(headers.date, 'Thu, 12 Nov 2026 09:59:50 +0000');
    assert.equal(headers['content-language'], 'sv-SE');
    assert.equal(headers['mime-version'], '1.0');
    assert.equal(headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(headers['auto-submitted'], 'auto-generated');
    assert.match(headers['message-id'], /^<[0-9a-f]{32}@example\.com>$/);
    assert.equal(body, mail.text.replace(/\n/g, '\r\n'));
  });

  test('has no Reply-To where the visitor gave no address', async () => {
    server = await smtpServer({ tls: certificate, account });
    await mailDelivery({ tls: trusted })(settings(server.port), { ...mail, replyTo: null });
    assert.equal(readMessage(server.received[0].data).headers['reply-to'], undefined);
  });

  test('in a local copy, is written to the log as it would have been sent, and goes nowhere', async () => {
    server = await smtpServer({ tls: certificate, account });
    const written = [];
    const deliver = mailDelivery({ toLog: true, write: (line) => written.push(line), tls: trusted });
    assert.deepEqual(await deliver(settings(server.port), mail), { refused: [] });
    assert.deepEqual(server.commands, [], 'nothing asked of the server');
    assert.equal(written.length, 1);
    assert.equal(written[0], [
      `A local copy sends no mail. This is what it would have sent through localhost:${server.port}:`,
      'From: site@example.com',
      'To: anna@example.com, bo@example.com',
      'Reply-To: ada@example.com',
      `Subject: ${mail.subject}`,
      'Date: Thu, 12 Nov 2026 09:59:50 +0000',
      'Content-Language: sv-SE',
      '',
      'Det här skickades med formuläret Kontakta oss.',
      '',
      'Meddelande',
      'Hej',
      '.och hå',
      '',
    ].join('\n'));
  });
});
