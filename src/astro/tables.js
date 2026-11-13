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

// Sätteri's HTML tree plugin that puts each table in its box.
export const tables = {
  name: 'konzilo-tables',
  element: {
    filter: ['table'],
    visit(node, ctx) {
      ctx.wrapNode(node, { type: 'element', tagName: 'div', properties: { className: ['konzilo-table'] }, children: [] });
    },
  },
};
