// The live preview's mark on each block of a body: its place among the body's blocks, counted as
// the body field holds them, so that a click on the page can find its way to the field. The
// count is taken from the body as it is read, before a site's components or the lightbox add
// anything, and a block with no element of its own, raw HTML say, still takes its number.
// Footnotes stand after the body's last block in the field, one block each, and so here.

export const BLOCK_PROPERTY = 'dataKonziloBlock';

const isElement = (node, tagName) => node?.type === 'element' && (tagName === undefined || node.tagName === tagName);

export const blockMarks = {
  name: 'konzilo-block-marks',
  after(root, ctx) {
    let at = 0;
    for (const node of root.children) {
      if (node.type === 'text' && node.value.trim() === '') continue;
      if (isElement(node) && node.properties?.dataFootnotes !== undefined) {
        const list = node.children.find((child) => isElement(child, 'ol'));
        for (const item of list?.children.filter((child) => isElement(child, 'li')) ?? []) {
          ctx.setProperty(item, BLOCK_PROPERTY, String(at));
          at += 1;
        }
        continue;
      }
      if (isElement(node)) ctx.setProperty(node, BLOCK_PROPERTY, String(at));
      at += 1;
    }
  },
};
