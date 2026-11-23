// What differs between two values of a field (ADR 0074): two texts word by word, two lists item by
// item, and two bodies block by block, as the body field reads them. Each is a list of parts in
// the order a reader reads them, each part marked `alike`, `removed` or `added`, an item `moved`
// too, and a block changed in its `words` or only in its `form`. It knows nothing of the page.

// Past this many pairs to weigh, two texts are told apart whole rather than word by word, so that
// a long text does not hold the page up.
const MOST_PAIRS = 4_000_000;

// How `a` becomes `b`, as steps: [change, item], by the longest run of items the two share.
function steps(a, b, same = (x, y) => x === y) {
  let start = 0;
  while (start < a.length && start < b.length && same(a[start], b[start])) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && same(a[endA - 1], b[endB - 1])) {
    endA -= 1;
    endB -= 1;
  }
  const head = a.slice(0, start).map((item) => ['alike', item, item]);
  const tail = a.slice(endA).map((item, at) => ['alike', item, b[endB + at]]);
  const [x, y] = [a.slice(start, endA), b.slice(start, endB)];
  const middle = [];
  if (x.length * y.length > MOST_PAIRS) {
    middle.push(...x.map((item) => ['removed', item]), ...y.map((item) => ['added', item]));
  } else {
    // The longest shared run from each pair of places onwards.
    const width = y.length + 1;
    const longest = new Uint32Array((x.length + 1) * width);
    for (let i = x.length - 1; i >= 0; i -= 1) {
      for (let j = y.length - 1; j >= 0; j -= 1) {
        longest[i * width + j] = same(x[i], y[j]) ? longest[(i + 1) * width + j + 1] + 1 : Math.max(longest[(i + 1) * width + j], longest[i * width + j + 1]);
      }
    }
    let [i, j] = [0, 0];
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && same(x[i], y[j])) {
        middle.push(['alike', x[i], y[j]]);
        i += 1;
        j += 1;
      } else if (j >= y.length || (i < x.length && longest[(i + 1) * width + j] >= longest[i * width + j + 1])) {
        middle.push(['removed', x[i]]);
        i += 1;
      } else {
        middle.push(['added', y[j]]);
        j += 1;
      }
    }
  }
  return [...head, ...middle, ...tail];
}

// Words and the space between them, each a part of its own.
const wordsOf = (text) => String(text ?? '').match(/\s+|[^\s]+/g) ?? [];

// Two texts word by word: [{ change, text }], neighbours of one change joined. Within a stretch of
// changes, what was removed comes before what was added.
export function wordsBetween(before, after) {
  const parts = [];
  let run = { removed: [], added: [] };
  const flush = () => {
    for (const change of ['removed', 'added']) if (run[change].length > 0) parts.push({ change, text: run[change].join('') });
    run = { removed: [], added: [] };
  };
  for (const [change, word] of steps(wordsOf(before), wordsOf(after))) {
    if (change === 'alike') {
      flush();
      const last = parts.at(-1);
      if (last?.change === 'alike') last.text += word;
      else parts.push({ change, text: word });
    } else run[change].push(word);
  }
  flush();
  return parts;
}

const keyOf = (item) => JSON.stringify(item);

// Two lists item by item: [{ change, item }], an item in both lists but out of the order they
// share `moved`, where it now stands. Within a stretch of changes, the moved come first, then the
// removed, then the added.
export function itemsBetween(before, after) {
  const script = steps(before.map(keyOf), after.map(keyOf));
  const removed = script.filter(([change]) => change === 'removed').map(([, key]) => key);
  const added = script.filter(([change]) => change === 'added').map(([, key]) => key);
  // An item removed in one place and added in another moved, once for each time it did.
  const moving = new Map();
  for (const key of added) {
    const at = removed.indexOf(key);
    if (at === -1) continue;
    removed.splice(at, 1);
    moving.set(key, (moving.get(key) ?? 0) + 1);
  }
  const leaving = new Map(moving);
  const items = [];
  let run = { moved: [], removed: [], added: [] };
  const flush = () => {
    items.push(...run.moved, ...run.removed, ...run.added);
    run = { moved: [], removed: [], added: [] };
  };
  for (const [change, key] of script) {
    const item = JSON.parse(key);
    if (change === 'alike') {
      flush();
      items.push({ change, item });
    } else if (change === 'removed') {
      if ((leaving.get(key) ?? 0) > 0) leaving.set(key, leaving.get(key) - 1);
      else run.removed.push({ change, item });
    } else if ((moving.get(key) ?? 0) > 0) {
      moving.set(key, moving.get(key) - 1);
      run.moved.push({ change: 'moved', item });
    } else run.added.push({ change, item });
  }
  flush();
  return items;
}

// What a node says in words, without its marks, links or other form.
const wordsIn = (node) => {
  if (typeof node?.value === 'string' && node.type !== 'html') return node.value;
  if (node?.type === 'image') return node.alt ?? '';
  return (node?.children ?? []).map(wordsIn).join(node?.children?.some((child) => ['paragraph', 'listItem', 'tableRow', 'tableCell'].includes(child.type)) ? ' ' : '');
};
const withoutPlaces = (node) => JSON.stringify(node, (key, value) => (key === 'position' ? undefined : value));

// A body's blocks as the reader reads them: { source, type, words, whole }.
function blocksOf(markdown, reader) {
  const text = String(markdown ?? '');
  if (text.trim() === '') return [];
  return (reader.tree(text).children ?? []).map((node) => ({
    source: text.slice(node.position.start.offset, node.position.end.offset),
    type: node.type,
    words: wordsIn(node),
    whole: withoutPlaces(node),
  }));
}

// Two bodies block by block, read by `reader` as the body field reads them: [{ change, before,
// after, parts }], `before` and `after` a block's Markdown. A block removed and one added in the
// same place, of one kind or with the same words, are one block changed: in its `words`, marked word by word in `parts`, or, where its
// words are alike, in its `form`, its marks or a link's target, shown both ways.
export function bodiesBetween(before, after, reader) {
  const blocks = [];
  let run = { removed: [], added: [] };
  const flush = () => {
    let paired = 0;
    while (paired < Math.min(run.removed.length, run.added.length)) {
      const [was, is] = [run.removed[paired], run.added[paired]];
      if (was.type !== is.type && was.words !== is.words) break;
      blocks.push(was.words === is.words
        ? { change: 'form', before: was.source, after: is.source }
        : { change: 'words', before: was.source, after: is.source, parts: wordsBetween(was.words, is.words) });
      paired += 1;
    }
    for (const was of run.removed.slice(paired)) blocks.push({ change: 'removed', before: was.source });
    for (const is of run.added.slice(paired)) blocks.push({ change: 'added', after: is.source });
    run = { removed: [], added: [] };
  };
  for (const [change, was, is] of steps(blocksOf(before, reader), blocksOf(after, reader), (x, y) => x.whole === y.whole)) {
    if (change === 'alike') {
      flush();
      blocks.push({ change, before: was.source, after: is.source });
    } else run[change].push(was);
  }
  flush();
  return blocks;
}
