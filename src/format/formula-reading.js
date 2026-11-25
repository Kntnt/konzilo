// How a `$` opens a formula, for every reader of Konzilo's Markdown: the intake's, the body
// field's and the site's (ADR 0075). Sätteri reads `$…$` as remark-math does, as a formula
// wherever a `$` closes one. The rule keeps such a formula only where it stands by Pandoc's
// rule: its LaTeX neither starts nor ends with a space and holds no `$`, and no digit follows
// it, so that "$5 and $10" stays text. Where one does not stand, its first `$` is read as a
// dollar sign, as though it were written `\$`, and the reader reads the body again, so that the
// `$` after it may open a formula of its own. A `$$…$$` is left as the reader found it.
//
// It imports nothing, and is handed the reader, so that the body field runs it in the browser.

const SPACE = /\s/u;

// Whether a formula the reader found in `source` stands by the rule.
function stands(node, source) {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (start === undefined || end === undefined || source[start] !== '$' || source[start + 1] === '$') return true;
  const latex = source.slice(start + 1, end - 1);
  return latex !== '' && !SPACE.test(latex[0]) && !SPACE.test(latex.at(-1)) && !latex.includes('$') && !/^\d/.test(source.slice(end));
}

function fallen(node, source) {
  if (node.type === 'inlineMath' && !stands(node, source)) return node;
  for (const child of node.children ?? []) {
    const found = fallen(child, source);
    if (found) return found;
  }
  return null;
}

// The places of `tree`, read from a text with a backslash at each offset of `added`, as the
// places of `markdown`, which has none of them.
function placedIn(tree, added, markdown) {
  const at = (point) => {
    if (point?.offset === undefined) return;
    const offset = point.offset - added.filter((one) => one < point.offset).length;
    point.offset = offset;
    point.column = offset - markdown.lastIndexOf('\n', offset - 1);
  };
  const walk = (node) => {
    at(node.position?.start);
    at(node.position?.end);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return tree;
}

// `markdown` read by the rule, by `parse(text)`, which gives a reader's tree with its places:
// { tree, changed }, `changed` where the rule read a `$` otherwise than the reader did. The tree's
// places are in `markdown`.
export function readFormulas(markdown, parse) {
  if (!markdown.includes('$')) return { tree: parse(markdown), changed: false };
  let text = markdown;
  const added = [];
  for (;;) {
    const tree = parse(text);
    const failing = fallen(tree, text);
    if (failing === null) return added.length === 0 ? { tree, changed: false } : { tree: placedIn(tree, added, markdown), changed: true };
    const at = failing.position.start.offset;
    for (let index = 0; index < added.length; index += 1) if (added[index] >= at) added[index] += 1;
    added.push(at);
    text = `${text.slice(0, at)}\\${text.slice(at)}`;
  }
}

// The reader the body check is handed, by Sätteri's `markdownToMdast` and the site's `features`:
// { tree(markdown, { math }) }, with its places. `math` is true to read formulas both ways, by the
// rule, as the site reads every content file; `display` for a body whose type takes block
// formulas alone, where `$…$` is text; and false for one that takes none, where a `$` is text.
export function formulaReader(markdownToMdast, features) {
  const read = {
    true: { ...features, math: true },
    display: { ...features, math: { singleDollarTextMath: false } },
    false: { ...features, math: false },
  };
  return Object.freeze({
    tree(markdown, { math = true } = {}) {
      const parse = (text) => markdownToMdast(text, { features: read[String(math)], position: true });
      return math === true ? readFormulas(markdown, parse).tree : parse(markdown);
    },
  });
}
