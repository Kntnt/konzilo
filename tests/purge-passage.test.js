// A purge of a passage from every old revision (ADR 0078): how a passage is found in the text as
// written, case-insensitively, through whitespace and the escapes that Markdown, YAML and JSON put
// into it, and taken out with nothing in its place.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { passageMatcher, passageOf } from '../src/purge/passage.js';

describe('a passage as it is found', () => {
  test('is taken trimmed, its whitespace one space, and refused where it is too short or too long', () => {
    assert.equal(passageOf('  Ebba   Svensson\t070-123 45 67 '), 'Ebba Svensson 070-123 45 67');
    assert.equal(passageOf('ab'), null);
    assert.equal(passageOf('   '), null);
    assert.equal(passageOf('x'.repeat(501)), null);
    assert.equal(passageOf(42), null);
  });

  test('is found whatever its case, across any whitespace, and taken out with nothing in its place', () => {
    const { holds, without } = passageMatcher('ebba svensson');
    assert.equal(holds('Call Ebba  Svensson today.'), true);
    assert.equal(holds('Call EBBA\nSVENSSON today.'), true);
    assert.equal(holds('Call Ebba Svenson today.'), false);
    assert.equal(without('Call Ebba  Svensson today, or ebba svensson.'), 'Call  today, or .');
    assert.equal(holds('Åsa Öberg'), false);
    assert.equal(passageMatcher('åsa öberg').holds('ÅSA ÖBERG'), true);
  });

  test('is found through the escapes Markdown, YAML and JSON write, which go with it', () => {
    const { holds, without } = passageMatcher('snake_case "quoted" 1*2');
    assert.equal(without('a snake\\_case \\"quoted\\" 1\\*2 b'), 'a  b');
    assert.equal(holds('{ "title": "snake_case \\"quoted\\" 1*2" }'), true);
    const mail = passageMatcher('ebba@example.com');
    assert.equal(mail.without('Mail ebba<!-- -->@example.com now.'), 'Mail  now.');
    assert.equal(mail.without('[ebba@example.com](mailto:ebba@example.com)'), '[](mailto:)');
    assert.equal(passageMatcher('line one line two').without('{ "text": "line one\\nline two" }'), '{ "text": "" }');
    assert.equal(passageMatcher('line one line two').without('line one\\\nline two'), '');
  });

  test('leaves nothing of it where taking it out joins it anew', () => {
    assert.equal(passageMatcher('abc').without('aabcbc and ABC'), ' and ');
  });

  test('says the text around each place it is found, up to the place before and the place after', () => {
    const { around } = passageMatcher('Ebba Svensson');
    const text = `${'x'.repeat(100)} Call Ebba\nSvensson on 070 or write to ebba svensson.`;
    assert.deepEqual(around(text), [
      { before: `${'x'.repeat(54)} Call `, match: 'Ebba Svensson', after: ' on 070 or write to ' },
      { before: ' on 070 or write to ', match: 'ebba svensson', after: '.' },
    ]);
  });
});
