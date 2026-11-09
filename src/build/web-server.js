// What the web server takes of a release (ADR 0036, ADR 0051): its `_headers` and `_redirects`,
// which a build writes and which are therefore untrusted, read line by line and written again as
// rules for Caddy, or refused whole. What is written holds nothing a Caddyfile would read as its
// own: every value lies in backticks, and neither a backtick nor a placeholder gets through.

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

// The rules of a release for Caddy, from what its `_headers` and `_redirects` hold, or a
// RefusedRules that says what is wrong. A rule lies in the address the browser asked for, the
// whole of it for a source with a query, and the path Caddy has decoded for the others.
export function webRules({ headers = '', redirects = '' }) {
  const header = headerRules(headers);
  const { path, address } = redirectRows(redirects);
  return [
    ...(header.every.length > 0 ? ['header {', ...header.every, '}'] : []),
    ...(header.consent.length > 0 ? [`@konzilo-consent path ${CONSENT_SECTION}`, 'header @konzilo-consent {', ...header.consent, '}'] : []),
    ...(address.length > 0 ? [...mapOf('{http.request.orig_uri}', ['konzilo.asked', 'konzilo.asked_status', 'konzilo.asked_keeps'], address), ...answering('asked', 'konzilo.asked', 'konzilo.asked_status', 'konzilo.asked_keeps')] : []),
    ...(path.length > 0 ? [...mapOf('{http.request.orig_uri.path}', ['konzilo.to', 'konzilo.status', 'konzilo.keeps'], path), ...answering('path', 'konzilo.to', 'konzilo.status', 'konzilo.keeps')] : []),
    '',
  ].join('\n');
}
