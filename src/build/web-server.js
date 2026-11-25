// What the web server takes of a release (ADR 0036, ADR 0051): its `_headers` and `_redirects`,
// which a build writes and which are therefore untrusted, read line by line and written again as
// rules for Caddy, or refused whole. What is written holds nothing a Caddyfile would read as its
// own: every value lies in backticks, and neither a backtick nor a placeholder gets through.

import { ACCEPT_LENGTH, ACCEPT_RANGES, markdownAddress } from '../astro/markdown-alternates.js';
import { CONSENT_SCRIPTS } from '../consent/registry.js';

// The names a release may set, and nothing the web server reads as its own.
const HEADER_NAMES = new Set(['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Content-Security-Policy', 'Reporting-Endpoints', 'X-Frame-Options', 'Permissions-Policy', 'Cross-Origin-Opener-Policy']);

// The one folder whose files have a header of their own, the consent
// scripts', and the one header they may have: a cache lifetime, public and
// short.
const CONSENT_SECTION = `${CONSENT_SCRIPTS}*`;
const CONSENT_CACHE = /^public, max-age=[0-9]{1,5}$/;
const LONGEST_HEADER = 65_536;
const REDIRECTS = new Set(['301', '302', '303', '307', '308']);
const NOTHING_THERE = new Set(['404', '410']);
const MOST_PERMUTED = 3;

// Printable ASCII, and none of what could end a value or be read as a placeholder.
const PLAIN = /^[\x20-\x7e]*$/;
const HIS_OWN = /[`{}\\]/;
const PATTERN_HIS_OWN = /[`]|\{\$/;
// What a percent sign may stand for in a path, for which the decoded path says something else.
const RESERVED_ENCODED = /%(?:2F|3F|23|25)/i;
const IN_PATH = /^\/[^\s"`{}\\]*$/;
const TARGET = /^(?:\/(?!\/)|https?:\/\/)[^\s"`{}\\]*$/;

export class RefusedRules extends Error {}

const refuse = (file, line, why) => {
  throw new RefusedRules(`${file}${line ? `, line ${line}` : ''}: ${why}`);
};

const quoted = (value) => `\`${value}\``;
const escapedForPattern = (text) => text.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');

// `_headers` as `header` holds it: `/*`, then one indented `Name: value` per header; and then,
// or not, the consent scripts' folder, with their Cache-Control alone. Returns { every, consent },
// the rules of each.
function headerRules(text) {
  const lines = text.split('\n').filter((line) => line !== '');
  if (lines.length === 0) return { every: [], consent: [] };
  if (lines[0] !== '/*') refuse('_headers', 1, 'it holds headers for every page, and nothing else');
  const rules = { every: [], consent: [] };
  let section = null;
  let seen = new Set();
  lines.forEach((line, at) => {
    if (!line.startsWith(' ')) {
      if (at > 0 && (line !== CONSENT_SECTION || section !== 'every')) refuse('_headers', at + 1, `besides every page it holds headers for ${CONSENT_SECTION} alone, once, after them`);
      section = at === 0 ? 'every' : 'consent';
      seen = new Set();
      return;
    }
    const [, name, value] = /^ {2}([A-Za-z-]+): (.*)$/.exec(line) ?? [];
    if (name === undefined) refuse('_headers', at + 1, 'a line is an indented name and value');
    if (section === 'every' ? !HEADER_NAMES.has(name) : name !== 'Cache-Control') refuse('_headers', at + 1, `${name} is no header a release may set${section === 'every' ? '' : ` for ${CONSENT_SECTION}`}`);
    if (seen.has(name)) refuse('_headers', at + 1, `${name} comes twice`);
    if (!PLAIN.test(value) || HIS_OWN.test(value)) refuse('_headers', at + 1, `the value of ${name} holds what the web server would read as its own`);
    if (value.length > LONGEST_HEADER) refuse('_headers', at + 1, `${name} is longer than a host takes`);
    if (section === 'consent' && !CONSENT_CACHE.test(value)) refuse('_headers', at + 1, `${CONSENT_SECTION} takes a public cache lifetime alone, such as public, max-age=300`);
    seen.add(name);
    rules[section].push(`\t${name} ${quoted(value)}`);
  });
  return rules;
}

// Each order the parameters of a source can come in, up to a number of them worth listing.
function orders(items) {
  if (items.length < 2) return [items];
  return items.flatMap((item, at) => orders(items.filter((_, other) => other !== at)).map((rest) => [item, ...rest]));
}

// What a source with a query answers to, as the request's whole address: in any order, each
// parameter's own, as a list while that is short, and past that as one expression, which also
// takes a query that repeats a parameter in place of another, which no link sends.
function askedInputs(path, query) {
  const plainPath = path.endsWith('/') ? [path, path.slice(0, -1)].filter(Boolean) : [path];
  const parameters = query.split('&');
  if (parameters.length <= MOST_PERMUTED) return plainPath.flatMap((one) => orders(parameters).map((order) => `${one}?${order.join('&')}`));
  const any = parameters.map(escapedForPattern).join('|');
  return plainPath.map((one) => `~^${escapedForPattern(one)}\\?(?:(?:${any})(?:&|$)){${parameters.length}}$`);
}

function decoded(path) {
  try {
    return decodeURI(path);
  } catch {
    return null;
  }
}

// `_redirects`: `<source> <target> <status>`, `<source> <status>`, and the same with a pattern, `^…`.
function redirectRows(text) {
  const byPath = new Map();
  const byAddress = new Map();
  const row = (rows, input, output) => {
    if (!rows.has(input)) rows.set(input, output);
  };
  const slashless = [];
  text.split('\n').forEach((line, at) => {
    if (line === '') return;
    const number = at + 1;
    if (!PLAIN.test(line)) refuse('_redirects', number, 'it holds what is not printable ASCII');
    const parts = line.split(' ');
    if (parts.length < 2 || parts.length > 3) refuse('_redirects', number, 'a line is a source, perhaps a target, and a status');
    const [source, target, status] = parts.length === 3 ? parts : [parts[0], '', parts[1]];
    if (target === '' ? !NOTHING_THERE.has(status) : !REDIRECTS.has(status)) refuse('_redirects', number, `a status of ${status} does not go with ${target === '' ? 'no target' : 'a target'}`);
    if (target !== '' && !TARGET.test(target.replace(/\$[1-9]/g, ''))) refuse('_redirects', number, 'its target holds what the web server would read as its own');
    const keeps = target.includes('?') ? '' : '1';
    if (source.startsWith('^')) {
      if (PATTERN_HIS_OWN.test(source)) refuse('_redirects', number, 'its pattern holds what the web server would read as its own');
      row(byPath, `~${source}`, { to: target.replace(/\$([1-9])/g, '${$1}'), status, keeps });
      return;
    }
    if (target.includes('$')) refuse('_redirects', number, 'only a pattern has groups for its target');
    if (!IN_PATH.test(source)) refuse('_redirects', number, 'its source holds what the web server would read as its own');
    const [path, query] = source.split(/\?(.*)/s);
    if (query !== undefined) {
      for (const input of askedInputs(path, query)) row(byAddress, input, { to: target, status, keeps: '' });
      return;
    }
    if (RESERVED_ENCODED.test(path)) {
      row(byAddress, `~^${escapedForPattern(path)}(?:\\?.*)?$`, { to: target, status, keeps });
      return;
    }
    const plain = decoded(path);
    if (plain === null) refuse('_redirects', number, 'its source is no address a browser sends');
    row(byPath, plain, { to: target, status, keeps });
    if (plain.endsWith('/') && plain !== '/') slashless.push([plain.slice(0, -1), { to: target, status, keeps }]);
  });
  // A rule's own source goes before what another's slash adds. A pattern answers last.
  const exact = [...byPath].filter(([input]) => !input.startsWith('~'));
  const patterns = [...byPath].filter(([input]) => input.startsWith('~'));
  const ordered = new Map(exact);
  for (const [input, output] of slashless) row(ordered, input, output);
  return { path: [...ordered, ...patterns], address: [...byAddress] };
}

const mapOf = (key, names, rows) => [
  `map ${key} ${names.map((name) => `{${name}}`).join(' ')} {`,
  ...rows.map(([input, output]) => `\t${quoted(input)} ${quoted(output.to)} ${output.status} ${quoted(output.keeps)}`),
  '\tdefault "" "" ""',
  '}',
];

// What a row found is answered with, and a matcher's name is that of what it looks at.
const answering = (name, to, status, keeps) => [
  `@${name}-keeps expression \`{${to}} != "" && {${keeps}} == "1" && {http.request.uri.query} != ""\``,
  `redir @${name}-keeps {${to}}?{http.request.uri.query} {${status}}`,
  `@${name}-goes expression \`{${to}} != ""\``,
  `redir @${name}-goes {${to}} {${status}}`,
  ...[...NOTHING_THERE].flatMap((code) => [
    `@${name}-${code} expression \`{${to}} == "" && {${status}} == "${code}"\``,
    `error @${name}-${code} ${code}`,
  ]),
];

// The rules of a release for Caddy, from what its `_headers` and `_redirects` hold, and, given
// the public host's origin, `origin`, those of its Markdown alternates, or a RefusedRules that
// says what is wrong. A rule lies in the address the browser asked for, the whole of it for a
// source with a query, and the path Caddy has decoded for the others.
export function webRules({ headers = '', redirects = '', origin = null }) {
  const header = headerRules(headers);
  const { path, address } = redirectRows(redirects);
  return [
    ...(header.every.length > 0 ? ['header {', ...header.every, '}'] : []),
    ...(header.consent.length > 0 ? [`@konzilo-consent path ${CONSENT_SECTION}`, 'header @konzilo-consent {', ...header.consent, '}'] : []),
    ...(address.length > 0 ? [...mapOf('{http.request.orig_uri}', ['konzilo.asked', 'konzilo.asked_status', 'konzilo.asked_keeps'], address), ...answering('asked', 'konzilo.asked', 'konzilo.asked_status', 'konzilo.asked_keeps')] : []),
    ...(path.length > 0 ? [...mapOf('{http.request.orig_uri.path}', ['konzilo.to', 'konzilo.status', 'konzilo.keeps'], path), ...answering('path', 'konzilo.to', 'konzilo.status', 'konzilo.keeps')] : []),
    ...(origin === null ? [] : alternateRules(origin)),
    '',
  ].join('\n');
}

// Where a release holds the marks of its Markdown alternates (ADR 0047): below its pages, in the
// core's reserved prefix, which the public host hands to the service, a folder for each kind,
// with an empty file at each alternate's address, as the web server reads an address, decoded.
// `markdown` marks a page's alternate, and `llms` and `llms-full` that llms.txt and llms-full.txt
// hold it.
export const ALTERNATE_MARKS = '_konzilo/alternates';
const HOLDERS = new Map([['/llms.txt', 'llms'], ['/llms-full.txt', 'llms-full']]);
// What a decoded path may not hold, which no page's address does.
const NOT_IN_A_PAGE = /[\x00-\x1f\x7f\\]/;

// A page's path as `_markdown` writes it, decoded, or a refusal: a path from the root, ending in
// a slash, each part of it a name, written as a browser sends it, as encodeURI() writes it.
function pagePath(page, number) {
  if (!/^\/(?:[^/]+\/)*$/.test(page)) refuse('_markdown', number, `${page} is no page's address`);
  let plain;
  try {
    plain = decodeURIComponent(page);
  } catch {
    refuse('_markdown', number, `${page} is not written as a browser sends it`);
  }
  const parts = plain.slice(1, -1).split('/');
  if (plain !== '/' && (NOT_IN_A_PAGE.test(plain) || parts.some((part) => part === '' || part === '.' || part === '..'))) refuse('_markdown', number, `${page} is no page's address`);
  if (encodeURI(plain) !== page) refuse('_markdown', number, `${page} is not written as a browser sends it`);
  return plain;
}

// What the web server takes of a release's `_markdown`, `text`, the list of its pages with a
// Markdown alternate, which its build wrote and is therefore untrusted: `<page> <alternate>`, then
// the files that hold the page, /llms.txt and /llms-full.txt, each line read and checked before
// the release is current. `holds(path)` says whether the release holds a file at the path from its
// root, decoded. Gives the marks to write, each a path from the release's root, or a RefusedRules
// that names the first line it cannot take: one that names no file of the release, an alternate
// that is not the page's, a page twice, or what is not as markdownList() writes it.
export function markdownMarks(text, holds) {
  const marks = [];
  const seen = new Set();
  text.split('\n').forEach((line, at) => {
    if (line === '') return;
    const number = at + 1;
    if (!PLAIN.test(line)) refuse('_markdown', number, 'it holds what is not printable ASCII');
    const [page, alternate, ...files] = line.split(' ');
    if (alternate === undefined || [page, alternate, ...files].includes('')) refuse('_markdown', number, 'a line is a page, its alternate and the files that hold it, one space between each');
    const plain = pagePath(page, number);
    if (seen.has(plain)) refuse('_markdown', number, `${page} comes twice`);
    seen.add(plain);
    const address = markdownAddress(plain);
    if (alternate !== encodeURI(address)) refuse('_markdown', number, `${alternate} is not the alternate of ${page}`);
    const holders = [...HOLDERS.keys()];
    files.forEach((file, index) => {
      if (!HOLDERS.has(file) || holders.indexOf(file) <= holders.indexOf(files[index - 1])) refuse('_markdown', number, `${file} is not /llms.txt or /llms-full.txt, each once and in that order`);
    });
    if (!holds(`${plain.slice(1)}index.html`)) refuse('_markdown', number, `${page} is no page of the release`);
    for (const [file, path] of [[alternate, address], ...files.map((file) => [file, file])]) if (!holds(path.slice(1))) refuse('_markdown', number, `${file} is no file of the release`);
    marks.push(`${ALTERNATE_MARKS}/markdown${address}`, ...files.map((file) => `${ALTERNATE_MARKS}/${HOLDERS.get(file)}${address}`));
  });
  return marks;
}

// The public host's origin, which a Link header names, as plain as an upstream's.
const ORIGIN = /^https?:\/\/(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::[0-9]{1,5})?$/;

// prefersMarkdown() of the dev server (markdown-alternates.js), as an expression in the CEL of
// Caddy's standard build, of the request's Accept header, which Caddy gives with its lines joined by
// commas, as the dev server takes it. A header of more than ACCEPT_LENGTH bytes, which the dev
// server reads one character each, or ACCEPT_RANGES ranges gets HTML. The rest is read in ASCII
// lowercase and split at each comma, and each range at each semicolon. A web server takes no
// control character but a tab in a header, so a part is matched with spaces and tabs around it,
// where the dev server trims it, and no part's pattern has a brace, which Caddy would read as a
// placeholder.
const celString = (pattern) => `'${pattern.replaceAll('\\', '\\\\')}'`;
const SPACE = String.raw`[ \t]*`;
const WEIGHT_PARAMETER = celString(`^${SPACE}q(?:${SPACE}=.*)?${SPACE}$`);
const GOOD_WEIGHT = celString(String.raw`^${SPACE}q${SPACE}=${SPACE}(?:0(?:\.[0-9]?[0-9]?[0-9]?)?|1(?:\.0?0?0?)?)${SPACE}$`);
// Whether the range `range` is of the media type `type`.
const isType = (range, type) => `${range}.split(';')[0].matches(${celString(`^${SPACE}${escapedForPattern(type)}${SPACE}$`)})`;
// A range's weight: 1 without a weight among its parameters, its parts after the first, 0 with
// more than one, and else the one's, where it is well formed, or 0. `[x].map(name, …)[0]` names a
// value once.
const weightOf = (range) => `[${range}.split(';')].map(ps, [ps.filter(p, p.matches(${WEIGHT_PARAMETER}))].map(qs, [ps[0].matches(${WEIGHT_PARAMETER}) ? 1 : 0].map(o, qs.size() - o == 0 ? 1.0 : qs.size() - o > 1 ? 0.0 : qs[o].matches(${GOOD_WEIGHT}) ? double(qs[o].split('=')[1].trim()) : 0.0)[0])[0])[0]`;
// Whether the weight `w` is above the effective weight of the first of `types`, most specific
// first, that a range of `rs` has, each type the most a range of it weighs.
const above = (types) => {
  const [type, ...wider] = types;
  const below = `rs.all(r, !${isType('r', type)} || ${weightOf('r')} < w)`;
  return wider.length === 0 ? below : `(rs.exists(r, ${isType('r', type)}) ? ${below} : ${above(wider)})`;
};
const PREFERS_MARKDOWN = `[{http.request.header.Accept}].exists(h, bytes(h).size() <= ${ACCEPT_LENGTH} && [h.lowerAscii().split(',')].exists(rs, rs.size() <= ${ACCEPT_RANGES} && rs.exists(m, (${isType('m', 'text/markdown')} || ${isType('m', 'text/x-markdown')}) && [${weightOf('m')}].exists(w, w > 0.0 && ${above(['text/html', 'text/*', '*/*'])} && ${above(['application/xhtml+xml', 'application/*', '*/*'])}))))`;

// A matcher of a GET or a HEAD of a page or an alternate, `asked`, whose alternate has a mark of
// `kind`, and that holds `also` besides, a CEL expression.
const marked = (name, asked, kind, also = null) => [
  `@${name} {`,
  '\tmethod GET HEAD',
  `\texpression \`{konzilo.alternate_asked} == "${asked}"${also ? ` && ${also}` : ''}\``,
  '\tfile {',
  `\t\troot {http.vars.root}/${ALTERNATE_MARKS}/${kind}`,
  '\t\ttry_files {konzilo.alternate}',
  '\t}',
  '}',
];

// The rules of the Markdown alternates (ADR 0047), the same for every release: no page is named
// in them, so a publish that adds or removes one needs no reload. A page's path, `/x/`, gives its
// alternate's, `/x.md`, `/` `/index.md` and `/x/index/` `/x/index/index.md`, as markdownAddress()
// has it, and the marks say which have one. A GET or a HEAD of a page with an alternate varies by
// Accept, and answers with the alternate where the request prefers Markdown; its HTML links the
// alternate, then llms.txt and llms-full.txt where they hold it, and the alternate, at its own
// address too, links the page, each Link on an answer with 2xx alone. Each Link names its address
// as the browser sent it, on `origin`; the marks are read by the decoded path, as the files are.
function alternateRules(origin) {
  if (!ORIGIN.test(String(origin))) refuse('the rules of the Markdown alternates', null, `"${origin}" is not the public host's origin`);
  const linked = (value, type) => [`\t\t+Link \`${value}\``, '\t\tmatch {', '\t\t\tstatus 2xx', ...(type ? [`\t\t\theader Content-Type ${type}*`] : []), '\t\t}'];
  return [
    'map {http.request.orig_uri.path} {konzilo.alternate} {konzilo.alternate_asked} {',
    '\t/ /index.md page',
    '\t/index.md /index.md alternate',
    '\t~^(.*/index)/$ ${1}/index.md page',
    '\t~^(.*/index)/index\\.md$ ${1}/index.md alternate',
    '\t~^(.+)/$ ${1}.md page',
    '\t~^(.+)\\.md$ ${1}.md alternate',
    '\tdefault "" ""',
    '}',
    'map {http.request.orig_uri} {konzilo.alternate_link} {konzilo.page_link} {',
    '\t~^/(?:\\?.*)?$ /index.md /',
    '\t~^/index\\.md(?:\\?.*)?$ /index.md /',
    '\t~^([^?]*/index)/(?:\\?.*)?$ ${1}/index.md ${1}/',
    '\t~^([^?]*/index)/index\\.md(?:\\?.*)?$ ${1}/index.md ${1}/',
    '\t~^([^?]+)/(?:\\?.*)?$ ${1}.md ${1}/',
    '\t~^([^?]+)\\.md(?:\\?.*)?$ ${1}.md ${1}/',
    '\tdefault "" ""',
    '}',
    ...marked('konzilo-alternate', 'alternate', 'markdown'),
    ...marked('konzilo-page', 'page', 'markdown'),
    ...marked('konzilo-llms', 'page', 'llms'),
    ...marked('konzilo-llms-full', 'page', 'llms-full'),
    ...marked('konzilo-markdown', 'page', 'markdown', PREFERS_MARKDOWN),
    // In a route, which keeps the order written.
    'route {',
    '\tvars {',
    '\t\tkonzilo_llms ""',
    '\t\tkonzilo_llms_full ""',
    '\t}',
    `\tvars @konzilo-llms konzilo_llms \`, <${origin}/llms.txt>; rel="related"; type="text/plain"\``,
    `\tvars @konzilo-llms-full konzilo_llms_full \`, <${origin}/llms-full.txt>; rel="related"; type="text/plain"\``,
    '\theader @konzilo-alternate {',
    ...linked(`<${origin}{konzilo.page_link}>; rel="canonical"`),
    '\t}',
    '\theader @konzilo-page +Vary Accept',
    '\theader @konzilo-page {',
    ...linked(`<${origin}{konzilo.alternate_link}>; rel="alternate"; type="text/markdown"{http.vars.konzilo_llms}{http.vars.konzilo_llms_full}`, 'text/html'),
    '\t}',
    '\theader @konzilo-page {',
    ...linked(`<${origin}{konzilo.page_link}>; rel="canonical"`, 'text/markdown'),
    '\t}',
    '\trewrite @konzilo-markdown {konzilo.alternate}',
    '}',
  ];
}

// A collection is named as the site, a hostname label; a key is base64, plain or for addresses;
// and Typesense's address an origin, a host by its name or its address, as the web server takes
// an upstream.
const COLLECTION = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SEARCH_KEY = /^[A-Za-z0-9+/=_-]+$/;
const UPSTREAM = ORIGIN;
const AS_JSON = '`application/json; charset=utf-8`';

// The route to the site's search (ADR 0053, ADR 0044), as rules for the web server's site host,
// which a build writes where the web server reads it and no visitor reaches it, outside every
// release: a GET of /_konzilo/search goes to Typesense's search of the site's collection,
// `collection`, at `upstream`, Typesense's origin as the web server reaches it, such as
// http://typesense:8108 in Compose (src/arrangement.js), with every header of the visitor's
// dropped and the scoped key, `key`, added, which holds the search every query runs. It answers
// as the dev server does: it passes on `q`, `page` and `filter_by` alone, each value as the
// visitor sent it, which the web server encodes again in Typesense's address, an `&` in it too,
// with page 1 where none is given, Typesense's own, and an empty filter where none is, which
// filters nothing; a value given twice comes as the two joined by a comma, where the dev server
// takes the first. It refuses another method with 405 and a path below it with 404; and
// Typesense's answer goes out as JSON, never kept. Its 502, while Typesense does not answer, is
// the Caddyfile's, which holds the site host's errors. With `key` null, on a site without search,
// it says that there is none. Each is checked, since what is written here is read as the web
// server's own.
export function searchRoute({ collection, key, upstream }) {
  if (!COLLECTION.test(String(collection))) refuse('the route to search', null, `"${collection}" is not the name of a collection`);
  if (key !== null && !SEARCH_KEY.test(String(key))) refuse('the route to search', null, 'the key is not plain base64');
  if (key !== null && !UPSTREAM.test(String(upstream))) refuse('the route to search', null, `"${upstream}" is not Typesense's origin`);
  // An answer of the route's own, to what `matcher` matches, or to all it is given without one.
  const answer = (matcher, status, message) => [
    `\t${['header', matcher, 'Content-Type', AS_JSON].filter(Boolean).join(' ')}`,
    `\t${['respond', matcher, `\`${JSON.stringify({ message })}\``, status].filter(Boolean).join(' ')}`,
  ];
  const kept = ['\theader Cache-Control no-store', '\theader X-Content-Type-Options nosniff'];
  if (key === null) {
    return ['@konzilo_search path /_konzilo/search /_konzilo/search/*', 'route @konzilo_search {', ...kept, ...answer('', 404, 'This site has no search.'), '}', ''].join('\n');
  }
  return [
    '@konzilo_search path /_konzilo/search /_konzilo/search/*',
    'route @konzilo_search {',
    ...kept,
    '\t@konzilo_search_below path /_konzilo/search/*',
    ...answer('@konzilo_search_below', 404, 'Not found.'),
    '\t@konzilo_search_other not method GET',
    '\theader @konzilo_search_other Allow GET',
    ...answer('@konzilo_search_other', 405, 'Search takes GET alone.'),
    '\tmap {query.page} {konzilo_page} {',
    '\t\t"" 1',
    '\t\tdefault {query.page}',
    '\t}',
    `\trewrite * /collections/${collection}/documents/search?q={query.q}&page={konzilo_page}&filter_by={query.filter_by}`,
    `\treverse_proxy ${upstream} {`,
    '\t\theader_up -*',
    `\t\theader_up X-TYPESENSE-API-KEY \`${key}\``,
    '\t\theader_down -*',
    `\t\theader_down Content-Type ${AS_JSON}`,
    '\t\ttransport http {',
    '\t\t\tdial_timeout 10s',
    '\t\t\tresponse_header_timeout 10s',
    '\t\t}',
    '\t}',
    '}',
    '',
  ].join('\n');
}
