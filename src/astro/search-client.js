// The search page's script, which Search.astro runs on that page
// alone, with no framework. It reads the query from the page's own address,
// `?q=<query>&page=<n>&type=<post type>`, as the search box and the search
// page's form send it, and the terms it is narrowed by, as a list's filter
// sends them, each taxonomy's parameter named by the taxonomy and repeated
// for each of its terms by its slug, `&topics=rivers&topics=lakes`. It asks
// the route /_konzilo/search, the terms of one taxonomy joined by or and the
// taxonomies by and, every match when only terms are given, and shows the
// results, a page of them, each with its title linked to its address, its
// type, its date and a snippet with the matched words marked, and links to
// the other pages, which keep the type and the terms, as the page's form
// does in hidden fields. What it found, within which terms, or why it found
// nothing, goes in the page's status, which screen readers announce. Every
// text is the one the page holds, in the site's language. The page names
// the taxonomies it narrows by in `data-taxonomies`, each with its terms'
// names by their slugs; a parameter that names none is no term. On a site in
// several languages the page names its language in `data-language`, and the
// script asks for that language's documents alone.
//
// Every value of Typesense's answer is put into the page as text; only the
// <mark> of a snippet's matched words becomes an element.
//
// The file is the page's module script as it is, with no import, so that the
// build copies it as it is (Search.astro) and it starts itself in a browser;
// in Node, where there is no window, it only defines searchClient(), which
// the converter suite runs under jsdom.

// Run it in `window`, the search page's; `fetch` is the window's own but in
// the converter suite. Done once the results, or a message, are shown.
export async function searchClient(window, { fetch = (...args) => window.fetch(...args) } = {}) {
  const { document } = window;
  const root = document.querySelector('[data-konzilo-search]');
  if (root === null) return;
  const texts = JSON.parse(root.dataset.texts);
  const status = root.querySelector('[role="status"]');
  const list = root.querySelector('.konzilo-search-results');
  const nav = root.querySelector('.konzilo-search-pages');

  const asked = new URLSearchParams(window.location.search);
  const query = (asked.get('q') ?? '').trim();
  const page = Math.max(1, Number.parseInt(asked.get('page') ?? '1', 10) || 1);
  const type = asked.get('type') ?? '';
  // The terms chosen, by taxonomy in the page's order, each slug once; a
  // value that is empty, or holds a backtick, which quotes a value in
  // Typesense's filter, is none.
  const taxonomies = JSON.parse(root.dataset.taxonomies ?? '{}');
  const chosen = Object.keys(taxonomies)
    .map((name) => [name, [...new Set(asked.getAll(name).map((slug) => slug.trim()))].filter((slug) => slug !== '' && !slug.includes('`'))])
    .filter(([, slugs]) => slugs.length > 0);
  const input = root.querySelector('input[name="q"]');
  if (input !== null) input.value = query;
  // The choice, as parameters, which a second search from the form sends
  // again, and the links to the other pages keep.
  const choice = [...(type === '' ? [] : [['type', type]]), ...chosen.flatMap(([taxonomy, slugs]) => slugs.map((slug) => [taxonomy, slug]))];
  const form = root.querySelector('form');
  for (const [name, value] of choice) {
    const hidden = document.createElement('input');
    Object.assign(hidden, { type: 'hidden', name, value });
    form?.append(hidden);
  }
  if (query === '' && chosen.length === 0) return;

  // On a site in several languages a language's search page searches that
  // language's documents alone. With terms alone, every post of them.
  const search = new URLSearchParams({ q: query === '' ? '*' : query, page: String(page) });
  const filters = [
    root.dataset.language ? `language:=${root.dataset.language}` : '',
    type !== '' ? `type:=${type}` : '',
    ...chosen.map(([taxonomy, slugs]) => `slugs_${taxonomy}:=[${slugs.map((slug) => `\`${slug}\``).join(',')}]`),
  ].filter(Boolean);
  if (filters.length > 0) search.set('filter_by', filters.join(' && '));
  let answer;
  try {
    const response = await fetch(`${root.dataset.konziloSearch}?${search}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`the route answered ${response.status}`);
    answer = await response.json();
  } catch {
    status.textContent = texts.notAnswering;
    return;
  }

  const count = answer.found ?? 0;
  if (count === 0 || !Array.isArray(answer.hits)) {
    status.textContent = texts.nothingFound;
    return;
  }
  const perPage = answer.request_params?.per_page ?? answer.hits.length;
  const last = Math.max(1, Math.ceil(count / perPage));
  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(values, name) ? String(values[name]) : whole));
  // What it searched within: each taxonomy's terms by their names, joined by
  // or, the taxonomies by and, in the page's language.
  const listFormat = (joined) => new Intl.ListFormat(root.dataset.languageTag || undefined, { type: joined });
  const within = listFormat('conjunction').format(chosen.map(([taxonomy, slugs]) => fill(texts.within, {
    terms: listFormat('disjunction').format(slugs.map((slug) => (Object.hasOwn(taxonomies[taxonomy], slug) ? taxonomies[taxonomy][slug] : slug))),
  })));
  // The status's text for one result and for several: with words, within terms, or both.
  const [oneResult, results] = chosen.length === 0 ? [texts.result, texts.results] : query === '' ? [texts.resultIn, texts.resultsIn] : [texts.resultWithin, texts.resultsWithin];
  status.textContent = fill(count === 1 ? oneResult : results, { count, query, within })
    + (last > 1 ? fill(texts.page, { page, pages: last }) : '');

  const dates = new Intl.DateTimeFormat(root.dataset.languageTag || undefined, { dateStyle: 'long', timeZone: 'UTC' });
  for (const hit of answer.hits) list.append(result(document, hit, dates));

  if (last > 1) {
    const to = (number) => `?${new URLSearchParams([...(query === '' ? [] : [['q', query]]), ...choice, ['page', String(number)]])}`;
    if (page > 1) nav.append(link(document, texts.previous, to(page - 1), 'prev'));
    if (page < last) nav.append(link(document, texts.next, to(page + 1), 'next'));
    nav.hidden = false;
  }
}

// A result: its title linked to its address, its type and its date, and a
// snippet: the body's matched words, else the excerpt's, else the excerpt.
function result(document, { document: found, highlights = [] }, dates) {
  const item = document.createElement('li');
  item.className = 'konzilo-search-result';
  const title = document.createElement('a');
  title.href = found.address;
  title.textContent = found.title;
  item.append(title);

  const about = document.createElement('p');
  about.className = 'konzilo-search-about';
  const type = document.createElement('span');
  type.className = 'konzilo-search-type';
  type.textContent = found.label;
  about.append(type);
  if (Number.isFinite(found.date)) {
    const moment = new Date(found.date * 1000);
    const time = document.createElement('time');
    time.dateTime = moment.toISOString();
    time.textContent = dates.format(moment);
    about.append(' ', time);
  }
  item.append(about);

  // A field, or on a site in several languages its copy in a language,
  // `body_sv` (searchDocuments() in ../search.js).
  const named = (highlight, field) => highlight.field === field || (typeof highlight.field === 'string' && highlight.field.startsWith(`${field}_`));
  const snippetOf = (field) => highlights.find((highlight) => named(highlight, field) && typeof highlight.snippet === 'string')?.snippet;
  const snippet = snippetOf('body') ?? snippetOf('excerpt');
  if (snippet !== undefined || typeof found.excerpt === 'string') {
    const text = document.createElement('p');
    text.className = 'konzilo-search-snippet';
    if (snippet === undefined) text.textContent = found.excerpt;
    else marked(document, text, snippet);
    item.append(text);
  }
  return item;
}

// A snippet's text into `element`, each word Typesense marks in a <mark>.
function marked(document, element, snippet) {
  let mark = null;
  for (const part of snippet.split(/(<mark>|<\/mark>)/)) {
    if (part === '<mark>') {
      mark = document.createElement('mark');
      element.append(mark);
    } else if (part === '</mark>') {
      mark = null;
    } else if (part !== '') {
      (mark ?? element).append(part);
    }
  }
}

function link(document, text, href, rel) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.rel = rel;
  anchor.textContent = text;
  return anchor;
}

if (typeof window !== 'undefined') searchClient(window);
