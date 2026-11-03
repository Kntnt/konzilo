// A time-based one-time code (RFC 6238, SHA-1, 30 seconds, six digits), as an
// authenticator app makes it from a key in base32. A local copy's seeded account
// logs in with both factors, as a live one does, so something has to make the
// code: the seed that enrols the account, and the command that prints it.

import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function fromBase32(text) {
  let bits = '';
  for (const character of text.toUpperCase().replace(/=+$/, '')) {
    const value = ALPHABET.indexOf(character);
    if (value < 0) throw new Error(`not base32: ${JSON.stringify(character)}`);
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

export function totp(key, now = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', fromBase32(key)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
