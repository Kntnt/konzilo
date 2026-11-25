// Formulas in body text (ADR 0075): the site reads `$…$` and `$$…$$` by the rule the intake
// reads them by (format/formula-reading.js), and shows each as Temml's static MathML
// (format/mathml.js). An inline formula is its `math` element alone, in the text; a block
// formula's `math`, with `display="block"`, stands in a `div` of Konzilo's own class,
// `konzilo-math`, with nothing else in it, which a design sizes and scrolls, as a table's box
// (tables.js). The box is the block: in the live preview the block's mark stands on it
// (block-marks.js). Each `math` keeps its LaTeX in its annotation, which the Markdown alternate
// writes back as the formula (html-to-markdown.js), and search and a summary read as its text.

import { markdownToMdast } from 'satteri';
import { readFormulas } from '../format/formula-reading.js';
import { mathML } from '../format/mathml.js';

// Sätteri's Markdown tree plugin that reads a body's formulas by the rule. A body whose every
// formula stands is left as Sätteri read it; any other is read again, as the rule reads it.
export const formulaReading = (context) => {
  if (!context.source.includes('$')) return null;
  const parse = (text) => markdownToMdast(text, { features: context.features, position: true });
  const { tree, changed } = readFormulas(context.source, parse);
  if (!changed) return null;
  return {
    name: 'konzilo-formula-reading',
    before(root, ctx) {
      ctx.replaceNode(root, tree);
    },
  };
};

// Sätteri's Markdown tree plugin that writes each formula as its MathML.
export const formulas = {
  name: 'konzilo-formulas',
  inlineMath(node, ctx) {
    ctx.replaceNode(node, { type: 'html', value: mathML(node.value) });
  },
  math(node, ctx) {
    ctx.replaceNode(node, { type: 'html', value: `<div class="konzilo-math">${mathML(node.value, true)}</div>` });
  },
};
