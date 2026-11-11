// The SMTP adapter (ADR 0003): a message handed to a mail server as a provider's submission port
// takes it, encrypted by STARTTLS or from the first byte, signed in where an account is given,
// against a server of the test's own on this machine, which keeps what it is given.

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

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
