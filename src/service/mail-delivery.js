// What hands a mail to the adapter an Admin chooses (ADR 0003), or, in a local copy, writes it to
// the service's log as it would have been sent, and sends it nowhere. By SMTP, a mail is a
// message as RFC 5322 and MIME write it: UTF-8 text, in printable ASCII lines that no mail server
// on the way changes.

import { randomBytes } from 'node:crypto';

import { sendBySmtp } from './smtp.js';

// The longest line a header is written on, as RFC 5322 recommends.
const LINE = 78;
// The bytes of UTF-8 an encoded word holds, so that `Subject: ` and one word fit on a line.
const WORD_BYTES = 42;

const printable = (value) => /^[\x20-\x7e]*$/.test(value);

// A header's value in encoded words (RFC 2047), each on a line of its own, no character split
// between two, where it is not printable ASCII or would not fit on its line as it is.
function encodedValue(name, value) {
  if (printable(value) && name.length + 2 + value.length <= LINE) return value;
  const words = [];
  let held = '';
  for (const character of value) {
    if (Buffer.byteLength(held + character) > WORD_BYTES) {
      words.push(held);
      held = '';
    }
    held += character;
  }
  words.push(held);
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word).toString('base64')}?=`).join('\r\n ');
}

// Addresses after a header's name, a comma between, on as many lines as they take.
function addressList(name, addresses) {
  const lines = [`${name}:`];
  addresses.forEach((address, at) => {
    const piece = ` ${address}${at < addresses.length - 1 ? ',' : ''}`;
    if (lines.at(-1).length + piece.length > LINE && lines.at(-1) !== `${name}:`) lines.push(piece);
    else lines[lines.length - 1] += piece;
  });
  return lines.join('\r\n');
}

// A moment as RFC 5322 dates a message, in UTC.
const dated = (date) => date.toUTCString().replace(/ GMT$/, ' +0000');

// The headers a person reads, as they read them.
const readHeaders = (mail) => [
  ['From', mail.from],
  ['To', mail.to.join(', ')],
  ...(mail.replyTo ? [['Reply-To', mail.replyTo]] : []),
  ['Subject', mail.subject],
  ['Date', dated(mail.date)],
  ['Content-Language', mail.language],
];

// A mail, as submissionMail() gives it (mail.js), as the message SMTP hands over: its lines ended
// by CRLF, its text in base64.
export function mimeMessage(mail) {
  const domain = mail.from.split('@').at(-1);
  const body = Buffer.from(mail.text.replace(/\r?\n/g, '\r\n')).toString('base64').match(/.{1,76}/g) ?? [];
  return [
    `From: ${mail.from}`,
    addressList('To', mail.to),
    ...(mail.replyTo ? [`Reply-To: ${mail.replyTo}`] : []),
    `Subject: ${encodedValue('Subject', mail.subject)}`,
    `Date: ${dated(mail.date)}`,
    `Message-ID: <${randomBytes(16).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    `Content-Language: ${mail.language}`,
    // A mail of a program's, which an out-of-office reply leaves alone (RFC 3834).
    'Auto-Submitted: auto-generated',
    '',
    ...body,
    '',
  ].join('\r\n');
}

// Where each adapter hands a mail to, as a person reads it.
const through = (settings) => `${settings.smtp.host}:${settings.smtp.port}`;

// What delivers a mail: (settings, mail) to { refused }, as the duty asks (mail.js). `toLog`: a
// local copy's, which writes each mail by `write` and sends none. `tls`: what the check of a mail
// server's certificate is given, such as a test's own `ca`.
export function mailDelivery({ toLog = false, write = console.log, tls = {} } = {}) {
  return async (settings, mail) => {
    if (toLog) {
      const head = readHeaders(mail).map(([name, value]) => `${name}: ${value}`).join('\n');
      write(`A local copy sends no mail. This is what it would have sent through ${through(settings)}:\n${head}\n\n${mail.text}`);
      return { refused: [] };
    }
    if (settings.adapter === 'smtp') return sendBySmtp(settings.smtp, { from: mail.from, to: mail.to, data: mimeMessage(mail) }, { tls });
    throw new Error(`the service has no mail adapter ${settings.adapter}`);
  };
}
