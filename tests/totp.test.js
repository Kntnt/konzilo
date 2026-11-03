// The code a local copy's account signs in with. The expected values are RFC
// 6238's test vectors for SHA-1, whose key is "12345678901234567890", cut to the
// six digits Forgejo asks for.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromBase32, totp } from '../src/totp.js';

const key = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('reads a key in base32, in either case and with padding', () => {
  assert.equal(fromBase32(key).toString(), '12345678901234567890');
  assert.equal(fromBase32('gezdgnbvgy3tqojq====').toString(), '1234567890');
  assert.throws(() => fromBase32('not base32!'), /not base32/);
});

for (const [seconds, code] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']]) {
  test(`gives ${code} at ${seconds} seconds, keeping leading zeros`, () => {
    assert.equal(totp(key, seconds * 1000), code);
  });
}
