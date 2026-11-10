// The live preview's mark on each block of a body: its place among the body's blocks, counted as
// the body field holds them, so that a click on the page can find its way to the field. The
// count is taken from the body as it is read, before a site's components or the lightbox add
// anything, and a block with no element of its own, raw HTML say, still takes its number.
// Footnotes stand after the body's last block in the field, one block each, and so here.
//
// A block that holds blocks is marked within as well, each by its path below it, `2.1` for the
// first block in the third: the blocks of a directive's body, and a list's items. A design that
// renders a component of its own keeps the marks of the blocks it is given.

export const BLOCK_PROPERTY = 'dataKonziloBlock';

const isElement = (node, tagName) => node?.type === 'element' && (tagName === undefined || node.tagName === tagName);
const isBlank = (node) => node.type === 'text' && node.value.trim() === '';

// The blocks within `node`, marked by their paths below `path`.
function markWithin(node, path, ctx) {
  if (isElement(node, 'ul') || isElement(node, 'ol')) {
    node.children.filter((child) => isElement(child, 'li')).forEach((item, index) => {
      const at = `${path}.${index}`;
      ctx.setProperty(item, BLOCK_PROPERTY, at);
      for (const inner of item.children.filter((child) => isElement(child, 'ul') || isElement(child, 'ol'))) markWithin(inner, at, ctx);
    });
    return;
  }
  if (!isElement(node) || node.properties?.dataDirective === undefined) return;
  let index = 0;
  for (const child of node.children) {
    if (isBlank(child)) continue;
    const at = `${path}.${index}`;
    if (isElement(child)) {
      ctx.setProperty(child, BLOCK_PROPERTY, at);
      markWithin(child, at, ctx);
    }
    index += 1;
  }
}

export const blockMarks = {
  name: 'konzilo-block-marks',
  after(root, ctx) {
    let at = 0;
    for (const node of root.children) {
      if (isBlank(node)) continue;
      if (isElement(node) && node.properties?.dataFootnotes !== undefined) {
        const list = node.children.find((child) => isElement(child, 'ol'));
        for (const item of list?.children.filter((child) => isElement(child, 'li')) ?? []) {
          ctx.setProperty(item, BLOCK_PROPERTY, String(at));
          at += 1;
        }
        continue;
      }
      if (isElement(node)) {
        ctx.setProperty(node, BLOCK_PROPERTY, String(at));
        markWithin(node, String(at), ctx);
      }
      at += 1;
    }
  },
};
