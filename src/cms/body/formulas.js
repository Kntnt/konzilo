// Formulas in the field (ADR 0075): Konzilo's own nodes for an inline formula and a block formula,
// each drawn by the Temml the site draws it with, and edited in a dialog of the field's own
// (formula-edit.js). Crepe's LaTeX is not used: its inline formula draws with KaTeX, and its block
// formula is a code block of CodeMirror's, which the field leaves out (ADR 0030).
//
// The field reads a value's `$` by the rule the intake reads it by (format/formula-reading.js),
// through remark-math, which reads `$…$` as Sätteri does, and writes a formula so that the intake
// reads it back: `$…$` with the empty comment after it where a digit or another formula follows,
// and `$$` on the lines around a block formula's LaTeX.

import { editorStateTimerCtx, editorViewCtx, ParserReady, parserCtx, remarkCtx } from '@milkdown/kit/core';
import { createTimer } from '@milkdown/kit/ctx';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { $command, $inputRule, $nodeSchema, $remark, $view } from '@milkdown/kit/utils';
import remarkMath from 'remark-math';

import { formulaText } from '../../format/formula-reading.js';
import { mathML } from '../../format/mathml.js';
import { made } from './dialog.js';
import { editFormula } from './formula-edit.js';
import { penOn, putAtCursor, TOP_ONLY } from './nodes.js';
import { say } from '../interface-language.js';

export { editFormula };

const INLINE = 'konzilo_formula';
const BLOCK = 'konzilo_formula_block';

// The mdast type an inline formula is written under, which the writer's handler writes (format.js).
export const FORMULA_NODE = 'konziloFormula';

// What remark reads of `$`, by what a type takes: both kinds, or block formulas alone.
export const remarkFormulas = (inline) => $remark('konziloRemarkMath', () => remarkMath, { singleDollarTextMath: inline });

// The parser reads a value, and a paste, by the rule: each `$` the rule reads as a dollar sign is
// escaped before remark reads it.
const FormulasRead = createTimer('KonziloFormulasRead');
export const formulaReading = (ctx) => {
  ctx.record(FormulasRead);
  ctx.update(editorStateTimerCtx, (timers) => [...timers, FormulasRead]);
  return async () => {
    await ctx.wait(ParserReady);
    const parse = ctx.get(parserCtx);
    const remark = ctx.get(remarkCtx);
    ctx.set(parserCtx, (text) => parse(formulaText(text, (markdown) => remark.parse(markdown))));
    ctx.done(FormulasRead);
    return () => {
      ctx.clearTimer(FormulasRead);
    };
  };
};

// An inline formula: its LaTeX, on one line, which holds no `$`.
export const inlineFormula = $nodeSchema(INLINE, () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  attrs: { latex: { default: '', validate: 'string' } },
  parseDOM: [{ tag: 'span[data-konzilo-formula]', getAttrs: (dom) => ({ latex: dom.dataset.latex ?? '' }) }],
  toDOM: ({ attrs: { latex } }) => ['span', { 'data-konzilo-formula': '', 'data-latex': latex }, latex],
  parseMarkdown: {
    match: ({ type }) => type === 'inlineMath',
    runner: (state, node, type) => state.addNode(type, { latex: node.value.replace(/\n/g, ' ') }),
  },
  toMarkdown: {
    match: (node) => node.type.name === INLINE,
    runner: (state, node) => state.addNode(FORMULA_NODE, undefined, node.attrs.latex),
  },
}));

// A block formula, which stands at the top of a body, as an image does.
export const blockFormula = $nodeSchema(BLOCK, () => ({
  group: TOP_ONLY,
  atom: true,
  isolating: true,
  selectable: true,
  draggable: true,
  attrs: { latex: { default: '', validate: 'string' } },
  parseDOM: [{ tag: 'div[data-konzilo-formula-block]', getAttrs: (dom) => ({ latex: dom.dataset.latex ?? '' }) }],
  toDOM: ({ attrs: { latex } }) => ['div', { 'data-konzilo-formula-block': '', 'data-latex': latex }, latex],
  parseMarkdown: {
    match: ({ type }) => type === 'math',
    runner: (state, node, type) => state.addNode(type, { latex: node.value }),
  },
  toMarkdown: {
    match: (node) => node.type.name === BLOCK,
    runner: (state, node) => state.addNode('html', undefined, `$$\n${node.attrs.latex}\n$$`),
  },
}));

// A formula's LaTeX as the dialog gives it back, or its removal, at the place it stood.
function answered(view, getPos, node, answer) {
  const pos = getPos();
  if (answer === null || pos === undefined || view.isDestroyed) return;
  if (answer.remove) view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
  else if (answer.latex !== node.attrs.latex) view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { latex: answer.latex }));
}

// How an inline formula shows in the field: as the site shows it, opened in the dialog by a click.
export const inlineFormulaView = $view(inlineFormula.node, () => (initial, view, getPos) => {
  let node = initial;
  const dom = made('span', 'konzilo-formula');
  dom.contentEditable = 'false';
  dom.title = say('body.formulaEdit');
  const show = () => {
    dom.innerHTML = mathML(node.attrs.latex);
  };
  show();
  dom.addEventListener('click', async () => {
    if (!view.editable) return;
    answered(view, getPos, node, await editFormula({ latex: node.attrs.latex }));
    view.focus();
  });
  return {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      if (next.attrs.latex !== node.attrs.latex) {
        node = next;
        show();
      }
      node = next;
      return true;
    },
    ignoreMutation: () => true,
  };
});

// How a block formula shows in the field: as the site shows it, with the pen to its dialog.
export const blockFormulaView = $view(blockFormula.node, () => (initial, view, getPos) => {
  let node = initial;
  const dom = made('div', 'konzilo-formula-field');
  dom.contentEditable = 'false';
  const shown = made('div', 'konzilo-formula-shown', dom);
  const show = () => {
    shown.innerHTML = mathML(node.attrs.latex, true);
  };
  const pen = penOn(dom, say('body.blockFormulaEdit'), async () => {
    answered(view, getPos, node, await editFormula({ latex: node.attrs.latex, display: true }));
    view.focus();
  });
  show();
  return {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      const changed = next.attrs.latex !== node.attrs.latex;
      node = next;
      if (changed) show();
      return true;
    },
    stopEvent: ({ target }) => pen.contains(target),
    ignoreMutation: () => true,
  };
});

// An inline formula in place of the selection, its LaTeX from the dialog, which starts from the
// text selected.
export const insertFormula = $command('KonziloInsertFormula', (ctx) => () => (state) => {
  const view = ctx.get(editorViewCtx);
  const { from, to } = state.selection;
  const selected = state.doc.textBetween(from, to, ' ').trim();
  void editFormula({ latex: selected, adding: true }).then((answer) => {
    if (answer?.latex && !view.isDestroyed) view.dispatch(view.state.tr.replaceWith(from, to, view.state.schema.nodes[INLINE].create({ latex: answer.latex })).scrollIntoView());
    view.focus();
  }).catch((error) => console.warn(`The formula was not put in: ${error.message}`));
  return true;
});

// A block formula in the body, its LaTeX from the dialog.
export const insertBlockFormula = $command('KonziloInsertBlockFormula', () => (latex) => (state, dispatch) => {
  if (!latex) return false;
  if (dispatch) putAtCursor(state, dispatch, state.schema.nodes[BLOCK].create({ latex }));
  return true;
});

// `$…$` typed by Pandoc's rule is an inline formula as its last `$` is typed: the LaTeX neither
// starts nor ends with a space, and holds no `$`. A `$` right after a backslash opens none.
export const formulaInputRule = $inputRule((ctx) => new InputRule(/(?<![\\$])\$([^\s$](?:[^$]*[^\s$])?)\$$/, (state, [, latex], start, end) => state.tr.replaceWith(start, end, inlineFormula.type(ctx).create({ latex }))));
