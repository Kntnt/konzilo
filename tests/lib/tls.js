// A certificate of its own for `localhost` and 127.0.0.1, made in Node alone, with a key that
// lives as long as the test that made it, so that a test server speaks TLS without a key in the
// repository or a tool outside Node. It signs itself, and the client trusts it by being handed it.

import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';

// DER, as X.509 writes it: a tag, the length, the contents.
const der = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  const length = body.length < 0x80
    ? Buffer.from([body.length])
    : (() => {
      const bytes = [];
      for (let left = body.length; left > 0; left >>= 8) bytes.unshift(left & 0xff);
      return Buffer.from([0x80 | bytes.length, ...bytes]);
    })();
  return Buffer.concat([Buffer.from([tag]), length, body]);
};
const sequence = (...parts) => der(0x30, ...parts);
const set = (...parts) => der(0x31, ...parts);
const oid = (dotted) => {
  const [first, second, ...rest] = dotted.split('.').map(Number);
  const bytes = [40 * first + second];
  for (const arc of rest) {
    const groups = [];
    for (let left = arc; ; left = Math.floor(left / 128)) {
      groups.unshift(left % 128);
      if (left < 128) break;
    }
    bytes.push(...groups.map((group, at) => (at < groups.length - 1 ? group | 0x80 : group)));
  }
  return der(0x06, Buffer.from(bytes));
};
const integer = (bytes) => der(0x02, bytes[0] & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
const generalizedTime = (at) => der(0x18, Buffer.from(`${at.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`));

const ED25519 = sequence(oid('1.3.101.112'));
const named = (common) => sequence(set(sequence(oid('2.5.4.3'), der(0x0c, Buffer.from(common)))));

// { key, cert }, PEM, as node:tls takes them.
export function selfSigned(name = 'localhost') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const now = Date.now();
  const alternatives = sequence(der(0x82, Buffer.from(name)), der(0x87, Buffer.from([127, 0, 0, 1])));
  const tbs = sequence(
    der(0xa0, integer(Buffer.from([2]))),
    integer(randomBytes(8)),
    ED25519,
    named(name),
    sequence(generalizedTime(new Date(now - 60_000)), generalizedTime(new Date(now + 24 * 3600_000))),
    named(name),
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, sequence(sequence(oid('2.5.29.17'), der(0x04, alternatives)))),
  );
  const certificate = sequence(tbs, ED25519, der(0x03, Buffer.from([0]), sign(null, tbs, privateKey)));
  const pem = (label, bytes) => `-----BEGIN ${label}-----\n${bytes.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), cert: pem('CERTIFICATE', certificate) };
}
