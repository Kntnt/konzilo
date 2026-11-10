// The files that are the site's rather than a post's: the page for addresses not found,
// the settings, the menus, the redirect rules and the service registry. A file the site
// cannot publish is refused whole, and its last file stays.

import { isObject } from '../checks.js';
import { registryFile } from '../format/consent.js';
import { declaredServices } from '../format/declared-services.js';
import { keyOf, REDIRECTS_FILE } from '../format/redirects.js';
import { climb, handsFor, masterFor } from './hands.js';
import { menuItems } from './menus.js';
import { fileText, writtenBody } from './post-file.js';
import { leadsTo } from './resolve.js';
import { ruleForFile } from './rules-file.js';
import { inBody, refuse } from './run.js';
import { settingsFor } from './settings.js';
import { sha256 } from './source.js';
import { named, say } from './words.js';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// The page for addresses not found: the chosen post's title and body alone, its images
// named from where the file is, in no collection and with no address of its own. A
// refused one keeps no version published before.
export function notFoundFiles(run, files) {
  const chosen = run.chosen.notFound;
  if (chosen === null) return;
  const posts = run.postsById.get(chosen) ?? [];
  const main = run.several ? run.site.languages[0].tag : null;
  const usable = posts.filter((post) => post.on && !run.refused.has(post.key));
  if (!usable.some((post) => post.tag === main)) {
    run.warnings.push(named({ file: 'settings.json', setting: 'notFound.page', reason: say('warning.not-found-none') }));
  }
  for (const post of usable) {
    const path = post.tag === main || !post.tag ? 'not-found.md' : `not-found/${post.tag}.md`;
    const from = climb(path);
    post.masters = new Map();
    const hands = handsFor(post, run, from);
    const { body, problems, warnings, embeds } = writtenBody(post, hands);
    if (problems.length > 0) {
      for (const problem of problems) refuse(run, post, inBody(problem, post));
      continue;
    }
    files.set(path, fileText([['title', JSON.stringify(post.title)]], body));
    post.written = {
      path,
      contents: files.get(path),
      published: sha256(files.get(path)),
      modified: run.ledger.posts[post.key]?.modified ?? run.nowText,
      taken: run.ledger.posts[post.key]?.taken ?? run.nowText,
      embeds,
      warnings: warnings.map((warning) => inBody(warning, post)),
      terms: [],
      masters: post.masters,
      notFound: true,
    };
  }
}

// The settings of each language, and what a choice of a post and an image lead to.
export function settingsFiles(run, files) {
  const { site } = run;
  const languages = run.several ? site.languages : [site.languages[0] ?? null];
  const results = [];
  const masters = new Map();
  const settingsPath = (language) => (run.several ? `settings/${language.tag}.json` : 'settings.json');
  let title;
  for (const language of languages) {
    const from = climb(settingsPath(language ?? {}));
    const hands = {
      title,
      choice(id, path) {
        const target = leadsTo(run, String(id), language);
        if (target.reason) return { reason: target.reason };
        if (target.none !== undefined) return { warning: say('warning.setting-no-page', { title: target.none ?? String(id), setting: path }) };
        const translated = run.several && target.otherLanguage ? say('warning.setting-translation', { title: target.title, language: language.tag }) : undefined;
        return { value: { title: target.title, url: target.address }, warning: translated };
      },
      image(value, stem, options = {}) {
        const given = isObject(value) ? value : { src: value };
        const master = masterFor(run, given.src, stem, from, options);
        if (master.reason) return { reason: master.reason };
        masters.set(`media/${master.master}`, master.contents);
        const alt = typeof given.alt === 'string' ? given.alt.trim() : '';
        return { value: { src: master.src, ...(alt ? { alt } : {}) }, warning: master.warning };
      },
    };
    const read = settingsFor(site, run.settingsSource, language, hands);
    if (language === languages[0]) title = read.values.title;
    results.push({ language, ...read });
  }
  const problems = results.flatMap((result) => result.problems);
  for (const { setting, reason } of problems) run.refusals.push(named({ file: 'settings.json', setting, reason }));
  if (problems.length > 0) return { refused: true, masters: new Map(), values: null };
  for (const { warnings } of results) for (const { setting, reason } of warnings) run.warnings.push(named({ file: 'settings.json', setting, reason }));
  for (const { language, values } of results) files.set(settingsPath(language ?? {}), json(values));
  return { refused: false, masters, values: results[0].values };
}

export function menuFiles(run, files) {
  const { site } = run;
  const languages = run.several ? site.languages : [site.languages[0] ?? null];
  for (const menu of Object.values(site.menus)) {
    for (const language of languages) {
      const name = run.several ? `${language.tag}/${menu.name}` : menu.name;
      const path = `menus/${name}.json`;
      if (run.gated.has(path)) continue;
      const source = run.source.menus.get(name);
      if (source?.refused) continue;
      const read = menuItems(source?.value ?? { items: [] }, (id) => {
        const target = leadsTo(run, id, language);
        return target.reason ? target : target.none !== undefined ? { none: target.none ?? '' } : target;
      });
      if (read.problems.length > 0) {
        for (const { entry, reason } of read.problems) run.refusals.push(named({ file: path, entry, reason }));
        continue;
      }
      for (const { entry, reason } of read.warnings) run.warnings.push(named({ file: path, entry, reason }));
      files.set(path, json({ items: read.items }));
    }
  }
}

export function redirectsFile(run, files) {
  if (run.rulesRefused) return;
  const exact = [];
  for (const rule of run.held.exact.values()) {
    const key = keyOf(rule.from);
    if (run.held.byAddress.has(key) || [...run.termPages.values()].some((page) => keyOf(page) === key)) {
      run.warnings.push(named({ file: REDIRECTS_FILE, reason: say('warning.rule-shadowed', { source: rule.from }) }));
    } else exact.push(ruleForFile(rule));
  }
  // A term's page answers its old addresses, the site's rules, with its current address.
  for (const [key, page] of run.termPages) {
    const term = run.terms.get(key);
    for (const from of run.ledger.terms[term.id]?.addresses ?? []) {
      if (keyOf(from) === keyOf(page) || run.held.byAddress.has(keyOf(from)) || run.held.exact.has(keyOf(from)) || run.held.others.has(keyOf(from))) continue;
      exact.push({ from, to: page, status: 301 });
    }
  }
  exact.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  files.set(REDIRECTS_FILE, json({ rules: [...exact, ...run.rules.patterns] }));
}

export function consentFile(run, files, settings, embeds) {
  if (settings.refused || run.gated.has('services.json') || run.source.services?.refused) return;
  const given = run.source.services?.value;
  const list = isObject(given) ? given.services ?? [] : Array.isArray(given) ? given : [];
  const { services, problems } = declaredServices(list, { adminHost: run.adminHost });
  if (problems.length > 0) {
    for (const { service, field, reason } of problems) run.refusals.push(named({ file: 'services.json', setting: `${service.id ?? service.name ?? 'a service'}.${field}`, reason }));
    return;
  }
  const previous = run.ledger.consent;
  const { file, warnings, asksConsent } = registryFile({ site: run.site, settings: settings.values, embeds: [...embeds].sort(), previous, now: run.now, declared: services });
  for (const { consent, reason } of warnings) run.warnings.push(named({ file: 'site-description.json', setting: consent, reason }));
  files.set(file.path, file.contents);
  const registry = JSON.parse(file.contents);
  run.consentRecord = { revision: registry.revision, revised: registry.revised };
  if (!settings.values.search?.publisher?.name) run.warnings.push(named({ file: 'settings.json', setting: 'search.publisher.name', reason: say('warning.publisher-missing') }));
  const legal = settings.values.legalPages ?? {};
  if (asksConsent && !legal.privacyPolicy) run.warnings.push(named({ file: 'settings.json', setting: 'legalPages.privacyPolicy', reason: say('warning.legal-missing', { page: say('about.privacy-policy') }) }));
  if (asksConsent && !legal.cookiePolicy) run.warnings.push(named({ file: 'settings.json', setting: 'legalPages.cookiePolicy', reason: say('warning.legal-missing', { page: say('about.cookie-policy') }) }));
}
