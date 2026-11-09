// What the web server takes of a release, which a build wrote and so nobody vouches for. Real
// Caddy reads what comes out of this in the Compose acceptance suite.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { RefusedRules, webRules } from '../src/build/web-server.js';
import { headersFile, securityHeaders } from '../src/astro/security-headers.js';
import { siteDescription } from '../src/site-description.js';

const refused = (given, words) => assert.throws(() => webRules(given), (error) => error instanceof RefusedRules && words.test(error.message), String(words));

describe('a release\'s headers', () => {
  const header = (line) => ({ headers: `/*\n  ${line}\n` });

  test('come out one by one, in backticks, quotes and all', () => {
    const rules = webRules({ headers: '/*\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: camera=(), fullscreen=(self "https://x.example")\n' });
    assert.match(rules, /^header \{\n\tX-Content-Type-Options `nosniff`\n\tPermissions-Policy `camera=\(\), fullscreen=\(self "https:\/\/x\.example"\)`\n\}\n/);
  });

  test('take what a real build writes, every opt-in on', () => {
    const description = siteDescription({
      language: 'en_GB',
      security: { includeSubDomains: true, frameAncestors: ['https://frame.example'] },
      types: { page: { label: 'Page', plural: 'Pages', collection: 'pages', address: '/{slug}/', elements: ['paragraph'], fields: {} } },
    });
    const headers = securityHeaders(description);
    assert.ok(headers.length >= 6);
    const rules = webRules({ headers: headersFile(headers) });
    for (const [name] of headers) assert.match(rules, new RegExp(`\\t${name} \``));
  });

  test('may be none', () => {
    assert.equal(webRules({}), '');
    assert.equal(webRules({ headers: '', redirects: '' }), '');
  });

  test('are refused whole for a name not on the list', () => {
    refused(header('Set-Cookie: a=b'), /Set-Cookie is no header/);
    refused(header('Server: mine'), /Server is no header/);
    refused({ headers: '/*\n  X-Content-Type-Options: nosniff\n  Location: https://elsewhere.example/\n' }, /Location is no header/);
  });

  test('are refused for a name twice, a shape it does not know, or for another path', () => {
    refused({ headers: '/*\n  X-Content-Type-Options: nosniff\n  X-Content-Type-Options: nosniff\n' }, /comes twice/);
    refused(header('X-Content-Type-Options nosniff'), /an indented name and value/);
    refused({ headers: 'X-Content-Type-Options: nosniff\n' }, /for every page/);
    refused({ headers: '/admin/*\n  X-Content-Type-Options: nosniff\n' }, /for every page/);
  });

  test('are refused for what the web server would read as its own', () => {
    for (const value of ['a`b', 'a{b}', '{env.SECRET}', 'a\\b', 'café', 'a\tb']) refused(header(`X-Frame-Options: ${value}`), /read as its own/);
  });

  test('give the consent scripts\' folder its public cache lifetime alone, after every page\'s', () => {
    const headers = headersFile([['X-Content-Type-Options', 'nosniff']], [{ path: '/_konzilo/consent/*', headers: [['Cache-Control', 'public, max-age=300']] }]);
    assert.equal(headers, '/*\n  X-Content-Type-Options: nosniff\n/_konzilo/consent/*\n  Cache-Control: public, max-age=300\n');
    assert.equal(webRules({ headers }), 'header {\n\tX-Content-Type-Options `nosniff`\n}\n@konzilo-consent path /_konzilo/consent/*\nheader @konzilo-consent {\n\tCache-Control `public, max-age=300`\n}\n');
    refused({ headers: '/*\n  X-Content-Type-Options: nosniff\n/_konzilo/forms/*\n  Cache-Control: public, max-age=300\n' }, /holds headers for \/_konzilo\/consent\/\* alone/);
    refused({ headers: '/*\n  X-Content-Type-Options: nosniff\n/_konzilo/consent/*\n  Cache-Control: public, max-age=300\n/_konzilo/consent/*\n  Cache-Control: public, max-age=300\n' }, /alone, once/);
    refused({ headers: '/*\n  X-Content-Type-Options: nosniff\n/_konzilo/consent/*\n  Set-Cookie: a=b\n' }, /Set-Cookie is no header a release may set for \/_konzilo\/consent\/\*/);
    refused({ headers: '/*\n  X-Content-Type-Options: nosniff\n/_konzilo/consent/*\n  Cache-Control: no-store\n' }, /takes a public cache lifetime alone/);
    refused({ headers: '/*\n  X-Content-Type-Options: nosniff\n/_konzilo/consent/*\n  X-Content-Type-Options: nosniff\n' }, /X-Content-Type-Options is no header a release may set for/);
  });

  test('are refused past what a host takes', () => {
    refused(header(`Content-Security-Policy: ${'a'.repeat(65_537)}`), /longer than a host takes/);
  });
});

describe('a release\'s redirects', () => {
  const rowsIn = (rules) => rules.split('\n').filter((line) => line.startsWith('\t`'));

  test('are looked up by the path, with and without its last slash, a rule\'s own first', () => {
    const rules = webRules({ redirects: '/a/ /b/ 301\n/c /d/ 302\n/c/ /e/ 307\n' });
    assert.match(rules, /^map \{http\.request\.orig_uri\.path\} \{konzilo\.to\} \{konzilo\.status\} \{konzilo\.keeps\} \{$/m);
    assert.deepEqual(rowsIn(rules), ['\t`/a/` `/b/` 301 `1`', '\t`/c` `/d/` 302 `1`', '\t`/c/` `/e/` 307 `1`', '\t`/a` `/b/` 301 `1`']);
  });

  test('keep the visitor\'s query, but where a target has one of its own', () => {
    assert.deepEqual(rowsIn(webRules({ redirects: '/a /b/?x=1 301\n' })), ['\t`/a` `/b/?x=1` 301 ``']);
    assert.match(webRules({ redirects: '/a /b/ 301\n' }), /redir @path-keeps \{konzilo\.to\}\?\{http\.request\.uri\.query\} \{konzilo\.status\}/);
  });

  test('match an address with its percent signs read, since that is what the web server looks at', () => {
    assert.deepEqual(rowsIn(webRules({ redirects: '/%C3%B6/a /b/ 301\n' })), ['\t`/ö/a` `/b/` 301 `1`']);
  });

  test('match on the whole address when reading a percent sign would say another path', () => {
    assert.deepEqual(rowsIn(webRules({ redirects: '/a%2Fb /c/ 301\n' })), ['\t`~^/a%2Fb(?:\\?.*)?$` `/c/` 301 `1`']);
  });

  test('answer a source with a query in any order of its parameters, and not by the path', () => {
    const rules = webRules({ redirects: '/a?x=1&y=2 /b/ 301\n' });
    assert.match(rules, /^map \{http\.request\.orig_uri\} \{konzilo\.asked\} \{konzilo\.asked_status\} \{konzilo\.asked_keeps\} \{$/m);
    assert.deepEqual(rowsIn(rules), ['\t`/a?x=1&y=2` `/b/` 301 ``', '\t`/a?y=2&x=1` `/b/` 301 ``']);
    assert.doesNotMatch(rules, /orig_uri\.path/);
    assert.deepEqual(rowsIn(webRules({ redirects: '/a/?x=1 /b/ 301\n' })), ['\t`/a/?x=1` `/b/` 301 ``', '\t`/a?x=1` `/b/` 301 ``']);
    assert.equal(rowsIn(webRules({ redirects: '/a?x=1&y=2&z=3 /b/ 301\n' })).length, 6);
  });

  test('take one expression for a query too long to list, in as many parameters as it has', () => {
    const [row] = rowsIn(webRules({ redirects: '/a?p=1&q=2&r=3&s=4 /b/ 301\n' }));
    const pattern = new RegExp(/`~(.*?)`/.exec(row)[1]);
    assert.ok(pattern.test('/a?s=4&q=2&p=1&r=3'));
    assert.ok(!pattern.test('/a?s=4&q=2&p=1'));
    assert.ok(!pattern.test('/a?s=4&q=2&p=1&r=9'));
    assert.ok(!pattern.test('/ab?s=4&q=2&p=1&r=3'));
  });

  test('say what is not there by status alone', () => {
    const rules = webRules({ redirects: '/gone/ 410\n/never/ 404\n' });
    assert.deepEqual(rowsIn(rules), ['\t`/gone/` `` 410 `1`', '\t`/never/` `` 404 `1`', '\t`/gone` `` 410 `1`', '\t`/never` `` 404 `1`']);
    assert.match(rules, /error @path-410 410/);
    assert.match(rules, /error @path-404 404/);
  });

  test('answer a pattern last, with its groups as the web server writes them', () => {
    const rules = webRules({ redirects: '^/a/(\\d+)/(x{2,3})$ /b/$1/$2/ 308\n/c/ /d/ 301\n' });
    assert.deepEqual(rowsIn(rules), ['\t`/c/` `/d/` 301 `1`', '\t`/c` `/d/` 301 `1`', '\t`~^/a/(\\d+)/(x{2,3})$` `/b/${1}/${2}/` 308 `1`']);
  });

  test('are refused whole for a line it cannot tell is safe', () => {
    for (const [line, words] of [
      ['/a /b/ 200', /status of 200/],
      ['/a 301', /status of 301/],
      ['/a /b/ 410', /status of 410/],
      ['/a /b/ 301 extra', /a source, perhaps a target/],
      ['/a', /a source, perhaps a target/],
      ['a /b/ 301', /source holds/],
      ['/a` /b/ 301', /source holds/],
      ['/{env.SECRET} /b/ 301', /source holds/],
      ['/a /b`/ 301', /target holds/],
      ['/a /{env.SECRET}/ 301', /target holds/],
      ['/a //elsewhere.example/ 301', /target holds/],
      ['/a javascript:alert(1) 301', /target holds/],
      ['/a /x$1/ 301', /only a pattern/],
      ['^/a{$HOME}$ /b/ 301', /pattern holds/],
      ['^/a`$ /b/ 301', /pattern holds/],
      ['/%E0%A4%A /b/ 301', /no address a browser sends/],
      ['/ö /b/ 301', /printable ASCII/],
    ]) {
      refused({ redirects: `/fine/ /ok/ 301\n${line}\n` }, words);
    }
  });

  test('name the line that was refused', () => {
    refused({ redirects: '/fine/ /ok/ 301\n/also/ /ok/ 301\n/a /b/ 200\n' }, /_redirects, line 3/);
  });
});
