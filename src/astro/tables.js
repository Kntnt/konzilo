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

const ALIGNED = /^text-align:\s*(left|center|right);?$/;
const LOGICAL = { left: 'start', center: 'center', right: 'end' };

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
        const aligned = typeof node.properties.style === 'string' ? ALIGNED.exec(node.properties.style.trim())?.[1] : undefined;
        if (aligned === undefined) return;
        ctx.setProperty(node, 'style', undefined);
        ctx.setProperty(node, 'dataAlign', LOGICAL[aligned]);
      },
    },
  ],
};
