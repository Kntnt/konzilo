// Redirect patterns: a rule of the site's whose source is a
// regular expression, which the Admin writes on the Redirects screen with a
// `^` first. A pattern is matched against a request's whole path, as the
// browser sent it and without its query, after everything else in the order
// of addresses, in the list's order; the first that matches
// answers, and a redirect's target may hold `$1` to `$9`, what the pattern's
// groups matched.
//
// A pattern is written in RE2's syntax, which Caddy matches online in linear
// time, and only in the part of it that JavaScript's and Go's regular
// expressions read alike, so that the dev server, the preview and the web server
// answer each request the same: characters a path may
// hold, `.`, classes such as `[a-z]` and `[^/]`, `\d`, `\w`, `\s` and their
// opposites, `\b` and `\B`, escaped punctuation such as `\.`, groups `( )`
// and `(?: )`, `|`, `*`, `+`, `?`, `{n}`, `{n,}` and `{n,m}` up to 1000, each
// lazy with a `?` after it, and `$`. Everything else is refused, naming it:
// lookaround and backreferences, which RE2 has not, named groups, flags,
// POSIX classes, and a counted repetition inside another, which RE2 may find
// too large. Each problem is a reason by its name in the core's catalogues and
// the values that fill it (refusals.js), which the intake gives the Admin and
// the build writes in British English.

const said = (name, values = {}) => ({ name, values });

// The most patterns a site has, and the longest a pattern is.
export const PATTERNS = 100;
export const PATTERN_LENGTH = 500;

// The largest count of a repetition, RE2's.
const REPEAT = 1000;

// Characters a pattern holds as themselves: those a path may hold that a
// regular expression gives no meaning, `%` among them.
const LITERAL = /^[A-Za-z0-9\-_~!&',;=:@/%]$/;

// What may follow `\`: a class of characters, a word boundary, or
// punctuation that stands for itself.
const CLASS_ESCAPES = 'dDwWsS';
const BOUNDARIES = 'bB';
const ESCAPED = '.^$|?*+()[]/-';

// Whether text is a pattern's, not an exact address's: it begins with `^`.
export function isPattern(text) {
  return typeof text === 'string' && text.startsWith('^');
}

// Why text cannot be a pattern, as { problem }, a refusal by its name, or
// { groups }, the number of its groups, when it can.
export function readPattern(text) {
  if (!isPattern(text)) return { problem: said('refusal.pattern-start', { pattern: String(text) }) };
  if (text.length > PATTERN_LENGTH) return { problem: said('refusal.rule-pattern-long', { most: PATTERN_LENGTH }) };
  const outside = [...text].find((c) => c < '!' || c > '~');
  if (outside !== undefined) return { problem: said('refusal.pattern-encoded', { pattern: text, character: JSON.stringify(outside) }) };
  try {
    return { groups: parse(text) };
  } catch (error) {
    if (!(error instanceof PatternError)) throw error;
    return { problem: error.words };
  }
}

// What a pattern holds that no pattern may, as `refusal.pattern-<why>` and its values.
class PatternError extends Error {
  constructor(pattern, why, values) {
    super(`pattern-${why}`);
    this.words = said(`refusal.pattern-${why}`, { pattern, ...values });
  }
}

// The number of groups of a pattern, or a PatternError naming what it holds
// that no pattern may.
function parse(text) {
  let i = 1;
  let groups = 0;
  const refuse = (why, values = {}) => {
    throw new PatternError(text, why, values);
  };
  // The open groups, innermost last, each with whether it holds a counted
  // repetition, and the sequence being read: whether its last item may be
  // repeated, and whether that item holds a counted repetition.
  const open = [{ counted: false }];
  let last = null;

  const quantifier = () => {
    const c = text[i];
    if (c === '*' || c === '+' || c === '?') {
      i += 1;
      return { counted: false };
    }
    const match = /^\{(\d+)(,(\d*))?\}/.exec(text.slice(i));
    if (match === null) refuse('brace', { repetitions: { or: ['{4}', '{2,5}'] } });
    const low = Number(match[1]);
    const high = match[2] === undefined ? low : match[3] === '' ? low : Number(match[3]);
    if (low > REPEAT || high > REPEAT) refuse('repeat-most', { most: REPEAT, repetition: match[0] });
    if (high < low) refuse('repeat-range', { repetition: match[0] });
    i += match[0].length;
    return { counted: true };
  };

  while (i < text.length) {
    const c = text[i];
    if (c === '*' || c === '+' || c === '?' || c === '{') {
      if (last === null) refuse('repeat-nothing', { character: c });
      const begun = i;
      const { counted } = quantifier();
      if (counted && last.counted) refuse('repeat-counted');
      if (text[i] === '?') i += 1;
      if (text[i] === '*' || text[i] === '+' || text[i] === '?' || text[i] === '{') {
        const second = text[i] === '{' ? /^\{[^}]*\}?/.exec(text.slice(i))[0] : text[i];
        refuse('repeat-twice', { repetition: `${text.slice(begun, i)}${second}` });
      }
      if (counted) open.at(-1).counted = true;
      last = null;
      continue;
    }
    if (c === '(') {
      if (text[i + 1] === '?') {
        const kind = text.slice(i, i + 5);
        if (text.startsWith('(?:', i)) {
          i += 3;
        } else if (/^\(\?(?:=|!|<=|<!)/.test(kind)) {
          refuse('lookaround');
        } else if (/^\(\?(?:P?<[A-Za-z_]|P=|P>)/.test(kind)) {
          refuse('named-group');
        } else {
          refuse('group-kind', { group: text.slice(i, i + 3) });
        }
      } else {
        groups += 1;
        i += 1;
      }
      open.push({ counted: false });
      last = null;
      continue;
    }
    if (c === ')') {
      if (open.length === 1) refuse('unopened');
      const group = open.pop();
      if (group.counted) open.at(-1).counted = true;
      last = { counted: group.counted };
      i += 1;
      continue;
    }
    if (c === '|') {
      last = null;
      i += 1;
      continue;
    }
    if (c === '^') refuse('caret');
    if (c === '$') {
      last = null;
      i += 1;
      continue;
    }
    if (c === '[') {
      i = readClass(text, i, refuse);
      last = { counted: false };
      continue;
    }
    if (c === '\\') {
      const next = text[i + 1];
      if (next === undefined) refuse('escape-end');
      if (/[1-9]/.test(next)) refuse('backreference', { reference: `\\${next}` });
      if (BOUNDARIES.includes(next)) last = null;
      else if (CLASS_ESCAPES.includes(next) || ESCAPED.includes(next)) last = { counted: false };
      else refuse('escape', { escape: `\\${next}` });
      i += 2;
      continue;
    }
    if (c === '.' || LITERAL.test(c)) {
      last = { counted: false };
      i += 1;
      continue;
    }
    refuse('character', { character: c });
  }
  if (open.length > 1) refuse('unclosed');
  return groups;
}

// Punctuation that stands for itself inside a class without an escape.
const IN_CLASS = '.$|?*+()^';

// Reads the class that begins at `start`, `[`, and returns where it ends.
// Its items are characters, escaped punctuation, `\d` and the like, and
// ranges between two characters; a `-` is a range's unless it comes first
// or last.
function readClass(text, start, refuse) {
  // The item at `at`: { char, next }, `char` null for `\d` and the like.
  const item = (at) => {
    const c = text[at];
    if (c === undefined) refuse('class-unclosed');
    if (c === '\\') {
      const next = text[at + 1];
      if (next === undefined) refuse('escape-end');
      if (CLASS_ESCAPES.includes(next)) return { char: null, next: at + 2 };
      if (ESCAPED.includes(next)) return { char: next, next: at + 2 };
      refuse('class-escape', { escape: `\\${next}` });
    }
    if (c === '[') refuse('class-nested');
    if (LITERAL.test(c) || IN_CLASS.includes(c)) return { char: c, next: at + 1 };
    return refuse('character', { character: c });
  };
  let i = start + 1;
  if (text[i] === '^') i += 1;
  if (text[i] === ']') refuse('class-empty');
  while (text[i] !== ']') {
    const low = item(i);
    i = low.next;
    if (text[i] !== '-' || text[i + 1] === ']' || text[i + 1] === undefined) continue;
    const high = item(i + 1);
    if (low.char === null || high.char === null) refuse('class-range');
    if (high.char < low.char) refuse('class-backwards', { range: `${low.char}-${high.char}` });
    i = high.next;
  }
  return i + 1;
}

// The regular expression in JavaScript that matches a whole path as the
// pattern does, or null for text that is no pattern.
export function compilePattern(text) {
  if (readPattern(text).problem !== undefined) return null;
  return new RegExp(`^(?:${text.slice(1)})$`);
}

// The group references a target holds, `$1` to `$9`, and `$0`, as numbers.
function referencesIn(target) {
  return [...target.matchAll(/\$(\d)/g)].map((match) => Number(match[1]));
}

// A target with each reference standing for `sample`.
function withSample(target, sample) {
  return target.replace(/\$[1-9]/g, sample);
}

// What a pattern's groups may plausibly match, to try its target with.
const SAMPLES = ['x', '', 'X', '1', 'x/x'];

// Why a target cannot be a pattern's, by its name, `about.target-…`, given
// `targetProblem` (redirects.js) for a target without references and
// `onSite`, or null. The target may hold `$1` to `$9`, each one of the
// pattern's groups, after the host of an `https://` address; and on the site,
// it may not be an address the pattern matches again, which would loop.
export function patternTargetProblem(pattern, target, groups, { targetProblem, onSite }) {
  const beyond = referencesIn(target).filter((n) => n === 0 || n > groups);
  if (beyond.length > 0) {
    const reference = `$${beyond[0]}`;
    if (groups === 0) return said('about.target-group-none', { reference });
    return groups === 1 ? said('about.target-group-one', { reference }) : said('about.target-groups', { reference, groups, last: `$${groups}` });
  }
  if (target.startsWith('https://')) {
    const host = target.slice('https://'.length).split(/[/?#]/)[0];
    if (host.includes('$')) return said('about.target-group-host');
  }
  const problem = targetProblem(withSample(target, 'x'));
  if (problem) return problem;
  const compiled = compilePattern(pattern);
  for (const sample of SAMPLES) {
    const shown = onSite(withSample(target, sample));
    if (shown !== null && compiled.test(shown.path)) return said('about.target-loop', { path: shown.path });
  }
  return null;
}

// Where a pattern's redirect sends a request at `path`, with `query` (null
// for none): its target with each `$n` what group n matched, and the
// request's query unless the target has one of its own, placed before the
// target's fragment. Null when the target would begin with `//`, an address
// on another host, which a pattern never leads to.
export function patternLocation(match, to, query) {
  const filled = to.replace(/\$([1-9])/g, (_, n) => match[Number(n)] ?? '');
  if (filled.startsWith('//')) return null;
  if (query === null || query === '' || filled.includes('?')) return filled;
  const hash = filled.indexOf('#');
  const [before, fragment] = hash === -1 ? [filled, ''] : [filled.slice(0, hash), filled.slice(hash)];
  return `${before}?${query}${fragment}`;
}

// The pattern that answers a request among `patterns` ({ pattern, to?,
// status }, in the list's order), each one the site can answer: `answer(path,
// query)` gives { rule, location } for the first that matches the path, as
// the browser sent it, `location` null for a 404 or a 410, or undefined when
// none matches, or when the path is below /_konzilo/, which no pattern
// answers, or no path as the site's addresses are (`isPath`). A redirect
// whose target would lead off the site through `//` answers nothing.
export function patternMatcher(patterns, { isPath }) {
  const compiled = patterns.map((rule) => ({ rule, expression: compilePattern(rule.pattern) }));
  return {
    answer(path, query) {
      if (!isPath(path) || path === '/_konzilo' || path.startsWith('/_konzilo/')) return undefined;
      for (const { rule, expression } of compiled) {
        const match = expression.exec(path);
        if (match === null) continue;
        if (rule.to === undefined) return { rule, location: null };
        const location = patternLocation(match, rule.to, query);
        return location === null ? undefined : { rule, location };
      }
      return undefined;
    },
  };
}
