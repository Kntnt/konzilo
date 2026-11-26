// Tables in body text: each table, a simple (pipe) table and a structured one alike, with
// its caption if it has one, stands in a `div` of Konzilo's own class, `konzilo-table`,
// with nothing else in it. A design sizes and scrolls that box, and the table inside it
// keeps its own layout: no engine lets a caption widen a table, percentage widths give
// every column the same share, and a table that is itself made to scroll loses its table
// layout. A content file holds the table alone; the box is the rendering's, as a figure
// is round an image (figures.js).
//
// The box is the block: in the live preview the block's mark stands on it
// (block-marks.js), so a click anywhere in the table leads to it, and a component's tree
// holds it, as the rendered body does. The Markdown alternate writes the table inside it
// and nothing of it (html-to-markdown.js).
//
// An aligned cell, `th` or `td`, says its alignment as the core's `data-align`, `start`,
// `center` or `end`, in place of the `style` a content file holds it in, `text-align: left`,
// `center` or `right`, and which the reader writes for a simple table's delimiter row: left
// is the start of the line and right its end, so that a column aligned to the right stands
// on the left on a right-to-left site. A design reads the attribute, which no inline style
// outranks, and the site's security policy has no style of a table to allow.

const ALIGNED = /^text-align:\s*(left|center|right)$/;
const LOGICAL = { left: 'start', center: 'center', right: 'end' };

// A cell's alignment as its `style` says it, `text-align: left`, `center` or `right`, as the reader
// writes it and a page of the site's own may: { align }, the core's `start`, `center` or `end`, and
// `rest`, what else the style says, '' for nothing; null where it says no alignment. The Markdown
// alternate reads a page's cells by it too (html-to-markdown.js).
export function styleAlignment(style) {
  if (typeof style !== 'string') return null;
  const declarations = style.split(';').map((one) => one.trim()).filter(Boolean);
  const at = declarations.findIndex((one) => ALIGNED.test(one));
  if (at === -1) return null;
  return { align: LOGICAL[ALIGNED.exec(declarations[at])[1]], rest: declarations.filter((_, i) => i !== at).join('; ') };
}

// Sätteri's HTML tree plugin that puts each table in its box, and writes each aligned
// cell's alignment as `data-align`.
export const tables = {
  name: 'konzilo-tables',
  element: [
    {
      filter: ['table'],
      visit(node, ctx) {
        ctx.wrapNode(node, { type: 'element', tagName: 'div', properties: { className: ['konzilo-table'] }, children: [] });
      },
    },
    {
      filter: ['th', 'td'],
      visit(node, ctx) {
        const aligned = styleAlignment(node.properties.style);
        if (aligned === null) return;
        ctx.setProperty(node, 'style', aligned.rest === '' ? undefined : aligned.rest);
        ctx.setProperty(node, 'dataAlign', aligned.align);
      },
    },
  ],
};
