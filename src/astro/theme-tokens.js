// The colour tokens a site names to the integration, resolved on its start
// page. The option `tokens` names the custom property that holds each colour
// role:
//
//   tokens: { colors: { primary: '--link', base: '--paper' } }
//
// Each colour is resolved as the start page's root has it, the main
// language's start page on a site in several languages, from every stylesheet
// the page loads, by the cascade: a declaration on `:root` or `html`, outside
// any conditional rule, the one that wins by importance, cascade layer,
// specificity and order, with each `var()` it holds resolved the same way.
// The resolved `primary` and `base` are the site's theme colours
// (theme-colors.js).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isObject } from '../checks.js';
import { readSiteDescription, SITE_DESCRIPTION_FILE } from '../site-description.js';
import { releaseFiles } from './body-styles.js';
import { startAddress } from './languages.js';

// The roles a site's colours take, by the names a site's tokens give them.
export const COLOR_ROLES = Object.freeze(['primary', 'base']);

const CUSTOM_PROPERTY = /^--[A-Za-z_][\w-]*$/;

// The option `tokens`, checked: { colors: { role: property } }, empty where
// the site names none. Throws, naming the option, on anything else.
export function tokensOf(tokens) {
  if (tokens === undefined) return { colors: {} };
  const problem = (message) => new Error(`Konzilo's option tokens ${message}`);
  if (!isObject(tokens)) throw problem(`must be an object of colors, not ${JSON.stringify(tokens)}`);
  for (const key of Object.keys(tokens)) {
    if (key !== 'colors') throw problem(`takes colors, not ${JSON.stringify(key)}`);
  }
  const given = tokens.colors ?? {};
  if (!isObject(given)) throw problem(`.colors must be an object of roles, not ${JSON.stringify(given)}`);
  for (const [role, property] of Object.entries(given)) {
    if (!COLOR_ROLES.includes(role)) throw problem(`.colors names ${JSON.stringify(role)}, which is none of ${COLOR_ROLES.join(', ')}`);
    if (typeof property !== 'string' || !CUSTOM_PROPERTY.test(property)) {
      throw problem(`.colors.${role} must name a custom property, such as '--ink', not ${JSON.stringify(property)}`);
    }
  }
  return { colors: { ...given } };
}

// The site's colours, by role, as the start page of the release `dir` (a file
// URL), built below `base` from the site repository at `root`, resolves its
// checked `tokens`; `warn` hears of each token with no value there.
export function resolvedColors(dir, { root, base, tokens, warn }) {
  const release = fileURLToPath(dir);
  const site = readSiteDescription(join(root, SITE_DESCRIPTION_FILE));
  // The main language's start page, at its prefix on a site in several
  // languages, whose root leads there.
  const start = join(release, ...startAddress(site.languages[0], site.languages).split('/').filter(Boolean), 'index.html');
  const html = existsSync(start) ? readFileSync(start, 'utf8') : '';
  return resolvedTokens(stylesheetsOf(html, releaseFiles(release, base)), tokens, { warn });
}

// The stylesheets a page loads, in its order: each linked one the release
// holds, and each style element's.
function stylesheetsOf(html, fileOf) {
  const sheets = [];
  const pattern = /<!--[\s\S]*?-->|<style\b[^>]*>([\s\S]*?)<\/style\s*>|<link\b([^>]*)>/gi;
  for (const [whole, style, link] of html.matchAll(pattern)) {
    if (whole.startsWith('<!--')) continue;
    if (style !== undefined) {
      sheets.push(style);
      continue;
    }
    const attributes = attributesOf(link);
    if (!/(^|\s)stylesheet(\s|$)/i.test(attributes.rel ?? '') || !attributes.href) continue;
    const file = fileOf(attributes.href);
    if (file) sheets.push(readFileSync(file, 'utf8'));
  }
  return sheets;
}

// The colours' values, by role.
function resolvedTokens(sheets, tokens, { warn }) {
  const declarations = rootDeclarations(sheets);
  const valueOf = (property, seen = new Set()) => {
    if (seen.has(property)) return null;
    const won = winner(declarations.get(property) ?? []);
    if (!won) return null;
    return resolved(won.value, (name) => valueOf(name, new Set([...seen, property])));
  };
  const colors = {};
  for (const [role, property] of Object.entries(tokens.colors)) {
    const value = valueOf(property);
    if (value === null || value === '') warn(`the site's ${role} colour goes unused, since the start page's root has no value of ${property}`);
    else colors[role] = value;
  }
  return colors;
}


// The custom properties the stylesheets declare on the root, each with every
// declaration of it and what decides between them.
function rootDeclarations(sheets) {
  const declarations = new Map();
  const layers = [];
  const layerRank = (name) => {
    if (!layers.includes(name)) layers.push(name);
    return layers.indexOf(name);
  };
  let order = 0;
  let anonymous = 0;
  const walk = (css, layer) => {
    for (const rule of rulesOf(css)) {
      if (rule.prelude.startsWith('@')) {
        const [, name, rest] = /^@([\w-]+)\s*(.*)$/s.exec(rule.prelude) ?? [];
        const at = name?.toLowerCase();
        if (at === 'layer') {
          const names = splitTopLevel(rest, ',').map((part) => part.trim()).filter(Boolean);
          const within = (part) => (layer === null ? part : `${layer}.${part}`);
          if (rule.block === null) names.forEach((part) => layerRank(within(part)));
          else {
            const inner = within(names[0] ?? `\0anonymous${anonymous += 1}`);
            layerRank(inner);
            walk(rule.block, inner);
          }
        }
        // Every other rule, conditional or not, holds nothing of the root's.
        continue;
      }
      if (rule.block === null) continue;
      const selectors = splitTopLevel(rule.prelude, ',').map((selector) => selector.trim().toLowerCase());
      const specificity = selectors.includes(':root') ? 2 : selectors.includes('html') ? 1 : 0;
      if (specificity === 0) continue;
      for (const { name, value, important } of declarationsOf(rule.block)) {
        if (!name.startsWith('--')) continue;
        if (!declarations.has(name)) declarations.set(name, []);
        declarations.get(name).push({ value, important, rank: layer === null ? Infinity : layerRank(layer), specificity, order: order += 1 });
      }
    }
  };
  for (const css of sheets) walk(css, null);
  return declarations;
}

// The declaration that wins the cascade: an important one over a normal one;
// among normal ones the unlayered, then the later layer; among important ones
// the earlier layer, then the unlayered; then specificity, then order.
function winner(candidates) {
  const key = ({ important, rank, specificity, order }) => [important ? 1 : 0, important ? -rank : rank, specificity, order];
  let best = null;
  for (const candidate of candidates) {
    if (best === null) {
      best = candidate;
      continue;
    }
    const [a, b] = [key(candidate), key(best)];
    const index = a.findIndex((value, i) => value !== b[i]);
    if (index !== -1 && a[index] > b[index]) best = candidate;
  }
  return best;
}

// A value with each var() in it replaced by what `valueOf` gives the
// property it names, or by its fallback; null when neither resolves.
function resolved(value, valueOf) {
  let out = '';
  let at = 0;
  const pattern = /var\(\s*/gi;
  for (let match = pattern.exec(value); match !== null; match = pattern.exec(value)) {
    const open = match.index + match[0].length;
    const close = closing(value, open);
    if (close === -1) return null;
    const [name, ...rest] = splitTopLevel(value.slice(open, close), ',');
    let replacement = valueOf(name.trim());
    if (replacement === null && rest.length > 0) replacement = resolved(rest.join(',').trim(), valueOf);
    if (replacement === null) return null;
    out += value.slice(at, match.index) + replacement;
    at = close + 1;
    pattern.lastIndex = at;
  }
  return (out + value.slice(at)).trim();
}

// Where the parenthesis open at `from` closes, skipping strings.
function closing(text, from) {
  let depth = 1;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' || c === "'") i = stringEnd(text, i);
    else if (c === '(') depth += 1;
    else if (c === ')' && (depth -= 1) === 0) return i;
  }
  return -1;
}

// The index of the quote that ends the string starting at `from`.
function stringEnd(text, from) {
  const quote = text[from];
  for (let i = from + 1; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === quote) return i;
  }
  return text.length;
}

// Parts of a text split at `separator` outside strings and parentheses.
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' || c === "'") i = stringEnd(text, i);
    else if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

// A stylesheet's rules at its top level, each { prelude, block }, the block
// null for a statement such as `@layer a, b;`. Comments go first.
function rulesOf(css) {
  const text = withoutComments(css);
  const rules = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' || c === "'") i = stringEnd(text, i);
    else if (c === ';') {
      const prelude = text.slice(start, i).trim();
      if (prelude) rules.push({ prelude, block: null });
      start = i + 1;
    } else if (c === '{') {
      const end = blockEnd(text, i + 1);
      rules.push({ prelude: text.slice(start, i).trim(), block: text.slice(i + 1, end) });
      i = end;
      start = end + 1;
    }
  }
  return rules;
}

// Where the block open at `from` ends, skipping strings and inner blocks.
function blockEnd(text, from) {
  let depth = 1;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' || c === "'") i = stringEnd(text, i);
    else if (c === '{') depth += 1;
    else if (c === '}' && (depth -= 1) === 0) return i;
  }
  return text.length;
}

function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'/g, (match) => (match.startsWith('/*') ? ' ' : match));
}

// A block's declarations, each { name, value, important }; nested rules,
// as CSS nesting writes them, are skipped.
function declarationsOf(block) {
  const found = [];
  for (const part of splitDeclarations(block)) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const name = part.slice(0, colon).trim();
    let value = part.slice(colon + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
    if (name) found.push({ name, value, important });
  }
  return found;
}

function splitDeclarations(block) {
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < block.length; i += 1) {
    const c = block[i];
    if (c === '"' || c === "'") i = stringEnd(block, i);
    else if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === '{') {
      // A nested rule: skip it whole.
      i = blockEnd(block, i + 1);
      start = i + 1;
    } else if (c === ';' && depth === 0) {
      parts.push(block.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(block.slice(start));
  return parts;
}

// A tag's attributes, by name in lowercase, their values unescaped.
function attributesOf(text) {
  const attributes = {};
  for (const [, name, double, single, bare] of text.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attributes[name.toLowerCase()] = unescaped(double ?? single ?? bare ?? '');
  }
  return attributes;
}

function unescaped(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (whole, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[lower];
  });
}
