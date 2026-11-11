// The redirect rules an Admin keeps, read: one that leads to a post is the post's and
// goes into its file, and the rest are the site's. An exact rule's target is a post or a
// term by ID, a path on the site or an `https://` address. A file the site cannot publish
// is refused whole, and its last file stays.

import { isObject } from '../checks.js';
import { PATTERN_LENGTH, PATTERNS } from '../format/patterns.js';
import { isSource, keyOf, onSite, patternProblem, REDIRECT_STATUSES, reservedBy, STATUSES, targetProblem } from '../format/redirects.js';
import { say } from './words.js';

const MOST_PARAMETERS = 10;

// The rules of a source file: { exact, patterns, problems, warnings }, each exact rule
// { from, to, post, term, status }, each pattern { pattern, to, status }.
export function readRules(given) {
  const problems = [];
  const warnings = [];
  const exact = [];
  const patterns = [];
  const list = isObject(given) ? given.rules : given;
  if (list !== undefined && list !== null && !Array.isArray(list)) {
    problems.push({ reason: say('refusal.rule-shape') });
    return { exact, patterns, problems, warnings };
  }
  const seen = new Set();
  (list ?? []).forEach((rule, index) => {
    const reason = readRule(rule, { exact, patterns, seen });
    if (reason) problems.push({ entry: String(index + 1), reason });
  });
  if (problems.length === 0) loopsAndChains(exact, problems, warnings);
  return { exact, patterns, problems, warnings };
}

// One rule into `exact` or `patterns`, or why the site cannot publish it.
function readRule(rule, { exact, patterns, seen }) {
  if (!isObject(rule)) return say('refusal.rule-shape');
  const status = /^\d+$/.test(String(rule.status)) ? Number(rule.status) : rule.status ?? 301;
  const pattern = rule.pattern ?? (typeof rule.from === 'string' && rule.from.startsWith('^') ? rule.from : undefined);
  if (pattern !== undefined) {
    if (rule.post || rule.term) return say('refusal.rule-pattern-post', { pattern });
    const problem = typeof pattern !== 'string' || pattern.length > PATTERN_LENGTH ? say('refusal.rule-pattern-long', { most: PATTERN_LENGTH }) : patternProblem({ from: pattern, to: rule.to, status });
    if (problem) return problem;
    if (seen.has(pattern)) return say('refusal.rule-twice', { source: pattern });
    seen.add(pattern);
    if (patterns.length >= PATTERNS) return say('refusal.rule-patterns', { most: PATTERNS });
    patterns.push({ pattern, ...(rule.to === undefined ? {} : { to: rule.to }), status });
    return null;
  }
  const { from } = rule;
  if (!isSource(from)) return say('refusal.rule-source', { source: String(from) });
  if (reservedBy(from) !== null) return say('refusal.rule-reserved', { source: from });
  if (from.includes('?') && from.slice(from.indexOf('?') + 1).split('&').length > MOST_PARAMETERS) return say('refusal.rule-parameters', { source: from, most: MOST_PARAMETERS });
  if (!STATUSES.includes(status)) return say('refusal.rule-status', { source: from, status: String(status), statuses: STATUSES.join(', ') });
  const key = keyOf(from);
  if (seen.has(key)) return say('refusal.rule-twice', { source: from });
  seen.add(key);
  const redirect = REDIRECT_STATUSES.includes(status);
  if (rule.post || rule.term) {
    if (!redirect) return say('refusal.rule-target', { source: from, reason: say('about.no-target', { status }) });
    exact.push({ from, status, post: rule.post ? String(rule.post) : undefined, term: rule.term ? String(rule.term) : undefined });
    return null;
  }
  const problem = redirect ? targetProblem(rule.to) : rule.to === undefined ? null : say('about.no-target', { status });
  if (problem) return say('refusal.rule-target', { source: from, reason: problem });
  exact.push({ from, status, ...(redirect ? { to: rule.to } : {}) });
  return null;
}

// A loop never answers, and a chain answers twice: each rule's target on the site
// against the sources of the others.
function loopsAndChains(exact, problems, warnings) {
  const bySource = new Map(exact.map((rule) => [keyOf(rule.from), rule]));
  const targetKey = (rule) => {
    const site = typeof rule.to === 'string' ? onSite(rule.to) : null;
    return site === null ? null : keyOf(`${site.path}${site.query === null ? '' : `?${site.query}`}`);
  };
  exact.forEach((rule, index) => {
    const entry = String(index + 1);
    const seen = new Set([keyOf(rule.from)]);
    let next = rule;
    for (;;) {
      const key = targetKey(next);
      if (key === null) break;
      if (seen.has(key)) {
        problems.push({ entry, reason: say('refusal.rule-loop', { source: rule.from }) });
        return;
      }
      seen.add(key);
      const after = bySource.get(key);
      if (!after) break;
      next = after;
    }
    if (seen.size > 2) warnings.push({ entry, reason: say('warning.rule-chain', { source: rule.from }) });
    if (rule.to === '/') warnings.push({ entry, reason: say('warning.rule-start', { source: rule.from }) });
  });
}

// What a rule of the site writes into content/redirects.json.
export function ruleForFile({ from, to, status }) {
  return to === undefined ? { from, status } : { from, to, status };
}
