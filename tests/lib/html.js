// Well-formed HTML to a tree of { tag, attributes, children } and strings, for a
// test that reads what the site's reader renders.

const voidTags = new Set(['br', 'hr', 'img', 'wbr']);
const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

function decode(text) {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (reference, decimal, hex, name) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    if (name in named) return named[name];
    throw new Error(`visible.js knows no character reference ${reference}; add it`);
  });
}

function attributes(text) {
  const found = {};
  for (const [, name, double, single, bare] of text.matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    found[name.toLowerCase()] = decode(double ?? single ?? bare ?? '');
  }
  return found;
}

export function parse(html) {
  const root = { tag: null, attributes: {}, children: [] };
  const stack = [root];
  const tokens = /<!--[\s\S]*?-->|<\/([a-z][a-z0-9-]*)\s*>|<([a-z][a-z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|[^<]+/giy;
  let read = 0;
  let match;
  while ((match = tokens.exec(html)) !== null) {
    const [token, closing, opening, attributeText] = match;
    read = tokens.lastIndex;
    const parent = stack.at(-1);
    if (token.startsWith('<!--')) continue;
    if (closing) {
      const tag = closing.toLowerCase();
      if (parent.tag !== tag) throw new Error(`visible.js: </${tag}> closes <${parent.tag}>`);
      stack.pop();
    } else if (opening) {
      const element = { tag: opening.toLowerCase(), attributes: attributes(attributeText), children: [] };
      parent.children.push(element);
      if (!voidTags.has(element.tag)) stack.push(element);
    } else {
      parent.children.push(decode(token));
    }
  }
  if (read !== html.length) throw new Error(`visible.js cannot read the HTML from ${JSON.stringify(html.slice(read, read + 20))}`);
  if (stack.length !== 1) throw new Error(`visible.js: <${stack.at(-1).tag}> is never closed`);
  return root.children;
}
