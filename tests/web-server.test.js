// What the web server takes of a release, which a build wrote and so nobody vouches for. Real
// Caddy reads what comes out of this in the Compose acceptance suite.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { markdownMarks, RefusedRules, searchRoute, webRules } from '../src/build/web-server.js';
import { ACCEPT_LENGTH, ACCEPT_RANGES } from '../src/astro/markdown-alternates.js';
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
      images: { smallestWidth: 400, displayWidth: 1280 },
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

// What the public host does with a release's Markdown alternates (ADR 0047), the same rules for
// every release, which name no page and so need no reload when a publish adds or removes one:
// real Caddy reads them in the acceptance suite.
describe('a release\'s rules for Markdown alternates', () => {
  const rules = webRules({ origin: 'https://www.example.com' });

  test('come with the public host\'s origin alone, and name no page', () => {
    assert.equal(webRules({ origin: 'https://www.example.com' }), rules);
    assert.ok(webRules({ origin: 'https://www.example.com', redirects: '/a/ /b/ 301\n' }).endsWith(`\n${rules}`), 'after the redirects');
    for (const origin of ['www.example.com', 'https://www.example.com/', 'https://www.example.com/x', 'https://{$SECRET}', 'https://a`b']) {
      assert.throws(() => webRules({ origin }), RefusedRules, origin);
    }
  });

  test('find a page\'s alternate by its mark, at the alternate\'s address, which a page\'s own gives', () => {
    for (const kind of ['markdown', 'llms', 'llms-full']) assert.match(rules, new RegExp(`\\troot \\{http\\.vars\\.root\\}/_konzilo/alternates/${kind}\\n\\t\\ttry_files \\{konzilo\\.alternate\\}\\n`), kind);
    assert.match(rules, /^map \{http\.request\.orig_uri\.path\} \{konzilo\.alternate\} \{konzilo\.alternate_asked\} \{\n\t\/ \/index\.md page\n\t\/index\.md \/index\.md alternate\n/m);
  });

  test('link the alternate and the files that hold the page from its HTML, and the page from its Markdown, on the public host', () => {
    assert.match(rules, /\+Link `<https:\/\/www\.example\.com\{konzilo\.alternate_link\}>; rel="alternate"; type="text\/markdown"\{http\.vars\.konzilo_llms\}\{http\.vars\.konzilo_llms_full\}`/);
    assert.match(rules, /konzilo_llms `, <https:\/\/www\.example\.com\/llms\.txt>; rel="related"; type="text\/plain"`/);
    assert.match(rules, /konzilo_llms_full `, <https:\/\/www\.example\.com\/llms-full\.txt>; rel="related"; type="text\/plain"`/);
    assert.equal(rules.split('+Link `<https://www.example.com{konzilo.page_link}>; rel="canonical"`').length, 3, 'from the alternate at its own address, and at the page\'s');
    assert.match(rules, /\theader @konzilo-page \+Vary Accept\n/);
  });

  test('weigh Accept as the dev server does, up to as many ranges and characters', () => {
    assert.match(rules, new RegExp(`bytes\\(h\\)\\.size\\(\\) <= ${ACCEPT_LENGTH} && \\[h\\.lowerAscii\\(\\)\\.split\\(','\\)\\]\\.exists\\(rs, rs\\.size\\(\\) <= ${ACCEPT_RANGES} `));
    assert.match(rules, /\trewrite @konzilo-markdown \{konzilo\.alternate\}\n/);
  });
});

// The pages a release has Markdown alternates of (ADR 0047), which its build lists in `_markdown`
// and the host checks line by line before the release is current: each line it takes becomes
// marks, empty files the web server looks for, and a line it cannot take refuses the release.
describe('a release\'s list of Markdown alternates', () => {
  // A release that holds these files, by their paths from its root.
  const holding = (...files) => (path) => files.includes(path);
  const RELEASE = holding('index.html', 'index.md', 'about/index.html', 'about.md', 'index/index.html', 'index/index.md', 'öppet/index.html', 'öppet.md', 'llms.txt', 'llms-full.txt');
  const refusedList = (line, words) => assert.throws(() => markdownMarks(`/about/ /about.md /llms.txt\n${line}\n`, RELEASE), (error) => error instanceof RefusedRules && words.test(error.message) && /_markdown, line 2/.test(error.message), `${line}: ${words}`);

  test('marks each page\'s alternate, and the files that hold it, at the alternate\'s address as the web server reads it', () => {
    const list = '/ /index.md /llms.txt /llms-full.txt\n/about/ /about.md /llms.txt\n/index/ /index/index.md\n/%C3%B6ppet/ /%C3%B6ppet.md /llms-full.txt\n';
    assert.deepEqual(markdownMarks(list, RELEASE), [
      '_konzilo/alternates/markdown/index.md',
      '_konzilo/alternates/llms/index.md',
      '_konzilo/alternates/llms-full/index.md',
      '_konzilo/alternates/markdown/about.md',
      '_konzilo/alternates/llms/about.md',
      '_konzilo/alternates/markdown/index/index.md',
      '_konzilo/alternates/markdown/öppet.md',
      '_konzilo/alternates/llms-full/öppet.md',
    ]);
  });

  test('may be empty, as on a site with Markdown off', () => {
    assert.deepEqual(markdownMarks('', RELEASE), []);
  });

  test('is refused for a line that names no file of the release', () => {
    refusedList('/gone/ /gone.md', /\/gone\/ is no page of the release/);
    refusedList('/contact/ /contact.md', /\/contact\/ is no page of the release/);
    assert.throws(() => markdownMarks('/about/ /about.md\n', holding('about/index.html')), /_markdown, line 1: \/about\.md is no file of the release/);
    assert.throws(() => markdownMarks('/about/ /about.md /llms-full.txt\n', holding('about/index.html', 'about.md')), /\/llms-full\.txt is no file of the release/);
  });

  test('is refused for an alternate that is not the page\'s, or a page twice', () => {
    refusedList('/index/ /index.md', /\/index\.md is not the alternate of \/index\//);
    refusedList('/about/ /about.md', /\/about\/ comes twice/);
  });

  test('is refused for a line it cannot tell is safe', () => {
    for (const [line, words] of [
      ['/about/', /a page, its alternate and the files that hold it/],
      ['/about/  /about.md', /a page, its alternate and the files that hold it/],
      ['/öppet/ /öppet.md', /printable ASCII/],
      ['/about /about.md', /no page's address/],
      ['about/ /about.md', /no page's address/],
      ['/../about/ /../about.md', /no page's address/],
      ['/a//b/ /a//b.md', /no page's address/],
      ['/%2E%2E/ /%2E%2E.md', /no page's address/],
      ['/a%2Fb/ /a%2Fb.md', /not written as a browser sends it/],
      ['/%c3%b6ppet/ /%c3%b6ppet.md', /not written as a browser sends it/],
      ['/%E0%A4%A/ /%E0%A4%A.md', /not written as a browser sends it/],
      ['/a%0Ab/ /a%0Ab.md', /no page's address/],
      ['/index/ /index/index.md /robots.txt', /\/robots\.txt is not \/llms\.txt or \/llms-full\.txt, each once and in that order/],
      ['/index/ /index/index.md /llms-full.txt /llms.txt', /\/llms\.txt is not \/llms\.txt or \/llms-full\.txt, each once and in that order/],
      ['/index/ /index/index.md /llms.txt /llms.txt', /\/llms\.txt is not \/llms\.txt or/],
    ]) {
      refusedList(line, words);
    }
  });
});

// The route to the site's search, which a build writes for the web server outside every release
// (ADR 0053): the same answers as the dev server's (src/astro/search.js), and real Caddy and
// Typesense take it in the Compose acceptance suite.
describe('the route to search', () => {
  const KEY = 'c2NvcGVkLWtleQ+/=';
  const route = searchRoute({ collection: 'gentle-garden', key: KEY, upstream: 'http://typesense:8108' });

  test('sends a search of the site\'s collection to Typesense, with the scoped key and none of the visitor\'s headers', () => {
    assert.match(route, /^@konzilo_search path \/_konzilo\/search \/_konzilo\/search\/\*\nroute @konzilo_search \{\n/m);
    assert.match(route, /\trewrite \* \/collections\/gentle-garden\/documents\/search\?/);
    assert.match(route, /\treverse_proxy http:\/\/typesense:8108 \{\n\t\theader_up -\*\n\t\theader_up X-TYPESENSE-API-KEY `c2NvcGVkLWtleQ\+\/=`\n/);
    assert.equal(route.split(KEY).length, 2, 'the key once, in the header alone');
  });

  // Where the web server reaches Typesense is the arrangement's: in Compose, by its name in the
  // network the two share; in another, wherever that puts it (src/arrangement.js).
  test('sends it to Typesense where it is given, as an origin and nothing more', () => {
    assert.match(searchRoute({ collection: 'gentle-garden', key: KEY, upstream: 'http://127.0.0.1:8108' }), /\treverse_proxy http:\/\/127\.0\.0\.1:8108 \{\n/);
    assert.match(searchRoute({ collection: 'gentle-garden', key: KEY, upstream: 'https://[fd00::8]:8108' }), /\treverse_proxy https:\/\/\[fd00::8\]:8108 \{\n/);
    for (const upstream of [undefined, 'typesense:8108', 'http://typesense:8108/', 'http://typesense:8108 {\n}', 'http://{$SECRET}:8108', 'http://typesense`:8108']) {
      assert.throws(() => searchRoute({ collection: 'gentle-garden', key: KEY, upstream }), RefusedRules, String(upstream));
    }
  });

  test('passes on q, page and filter_by alone, which the web server writes into Typesense\'s address encoded, page 1 where none is given', () => {
    assert.match(route, /\tmap \{query\.page\} \{konzilo_page\} \{\n\t\t"" 1\n\t\tdefault \{query\.page\}\n\t\}\n/);
    assert.match(route, /search\?q=\{query\.q\}&page=\{konzilo_page\}&filter_by=\{query\.filter_by\}\n/);
    assert.doesNotMatch(route, /\{http\.request\.uri\.query\}|\{query\}/, 'nothing else of the visitor\'s query');
  });

  test('answers as the dev server does: 405 to another method, 404 below it, never kept', () => {
    assert.match(route, /@konzilo_search_below path \/_konzilo\/search\/\*\n[\s\S]*respond @konzilo_search_below `\{"message":"Not found\."\}` 404\n/);
    assert.match(route, /@konzilo_search_other not method GET\n\theader @konzilo_search_other Allow GET\n[\s\S]*respond @konzilo_search_other `\{"message":"Search takes GET alone\."\}` 405\n/);
    assert.match(route, /\theader Cache-Control no-store\n/);
    assert.match(route, /\t\theader_down -\*\n\t\theader_down Content-Type `application\/json; charset=utf-8`\n/);
    assert.ok(route.indexOf('respond @konzilo_search_below') < route.indexOf('rewrite'), 'in a route, which keeps the order written');
  });

  test('says on a site without search that it has none, and holds no key', () => {
    const none = searchRoute({ collection: 'gentle-garden', key: null });
    assert.match(none, /respond `\{"message":"This site has no search\."\}` 404\n/);
    assert.doesNotMatch(none, /reverse_proxy|X-TYPESENSE/);
  });

  test('takes a collection and a key only as plain as a Caddyfile cannot read as its own', () => {
    assert.throws(() => searchRoute({ collection: 'a site', key: KEY }), RefusedRules);
    assert.throws(() => searchRoute({ collection: 'a-site', key: 'a`key' }), RefusedRules);
    assert.throws(() => searchRoute({ collection: 'a-site', key: '{$SECRET}' }), RefusedRules);
  });
});
