// The Public Suffix List (https://publicsuffix.org/list/), which a host a
// service declares with `*.` is checked against (declared-services.js): its ICANN section names the suffixes under which anyone may
// register a domain, such as co.uk, and its PRIVATE section the domains of
// shared hosts, under which anyone may have a host, such as github.io or
// s3.amazonaws.com. `*.` before such a name, or before a name that holds
// one below it, would let the pages reach anyone's code.
//
// public-suffixes.json holds the list at a commit of its repository's
// default branch, which versions.env pins as PUBLIC_SUFFIX_LIST: the commit,
// the SHA-256 of the list's file at it, and the rules of each section, each
// host name in its xn-- form, as a declared host is written.

import { domainToASCII } from 'node:url';
import list from './public-suffixes.json' with { type: 'json' };

// The list's two sections, in the file's order, as the JSON names them.
export const SECTIONS = Object.freeze(['icann', 'private']);

const MARKERS = { icann: '===BEGIN ICANN DOMAINS===', private: '===BEGIN PRIVATE DOMAINS===' };

// The rules of each section of the list's file `text`, as
// public-suffixes.json holds them: { icann, private }, each sorted, each
// once, a rule's host name in its xn-- form, its `*.` or `!` kept. A rule is
// a line's first word; a line that starts with `//` is a comment. Throws on
// a rule outside a section, or one that is no host name.
export function suffixesOf(text) {
  const found = { icann: new Set(), private: new Set() };
  let section = null;
  for (const line of text.split('\n')) {
    const word = line.trim().split(/\s/)[0];
    if (word.startsWith('//')) {
      section = SECTIONS.find((name) => line.includes(MARKERS[name])) ?? section;
      if (/===END (ICANN|PRIVATE) DOMAINS===/.test(line)) section = null;
      continue;
    }
    if (word === '') continue;
    if (section === null) throw new Error(`the Public Suffix List's rule ${word} is in no section`);
    const prefix = /^(!|\*\.)?/.exec(word)[0];
    const name = domainToASCII(word.slice(prefix.length));
    if (name === '' || name.includes('*')) throw new Error(`the Public Suffix List's rule ${word} is no host name`);
    found[section].add(`${prefix}${name}`);
  }
  return { icann: [...found.icann].sort(), private: [...found.private].sort() };
}

// The rules by kind: a name, the name after `*.`, whose every subdomain is a
// suffix, and an exception, which names a domain anyone may own below such a
// rule. A rule in both sections counts in the first.
const RULES = new Map();
const WILDCARDS = new Map();
const EXCEPTIONS = new Set();
for (const section of SECTIONS) {
  for (const rule of list[section]) {
    if (rule.startsWith('!')) EXCEPTIONS.add(rule.slice(1));
    else if (rule.startsWith('*.')) WILDCARDS.has(rule.slice(2)) || WILDCARDS.set(rule.slice(2), section);
    else RULES.has(rule) || RULES.set(rule, section);
  }
}

// The section in which a host name, in lowercase and its xn-- form, is
// itself a public suffix, or null where it is none.
function sectionOf(name) {
  if (EXCEPTIONS.has(name)) return null;
  if (RULES.has(name)) return RULES.get(name);
  const dot = name.indexOf('.');
  return dot === -1 ? null : WILDCARDS.get(name.slice(dot + 1)) ?? null;
}

const labels = (name) => name.split('.').length;

// What `*.<name>` takes in of the list, a host name in lowercase and its
// xn-- form: null where it takes in no suffix, else the suffix it names
// first, { suffix, section, each }: the name itself where it is one, or the
// suffix below it with the fewest labels, then the shortest, then the first
// in order; `each` where the list makes every subdomain of `suffix` one.
export function suffixTakenIn(name) {
  const own = sectionOf(name);
  if (own !== null) return { suffix: name, section: own, each: false };
  const below = [];
  for (const [rule, section] of RULES) if (rule.endsWith(`.${name}`)) below.push({ rule, suffix: rule, section, each: false });
  for (const [rule, section] of WILDCARDS) if (rule === name || rule.endsWith(`.${name}`)) below.push({ rule: `*.${rule}`, suffix: rule, section, each: true });
  if (below.length === 0) return null;
  const [first] = below.sort((a, b) => labels(a.rule) - labels(b.rule) || a.rule.length - b.rule.length || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));
  return { suffix: first.suffix, section: first.section, each: first.each };
}
