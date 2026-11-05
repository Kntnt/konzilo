// Konzilo's own nodes and marks in the field (ADR 0030): a block kept as source, an image with
// its texts, a quote's citation, a heading's anchor, `<sup>` and `<sub>`, a non-breaking space
// and footnotes.

import { commandsCtx } from '@milkdown/kit/core';
import { blockquoteSchema, emphasisSchema, headingSchema, linkSchema, strongSchema } from '@milkdown/kit/preset/commonmark';
import { strikethroughSchema } from '@milkdown/kit/preset/gfm';
import { setBlockType, toggleMark } from '@milkdown/kit/prose/commands';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { keymap } from '@milkdown/kit/prose/keymap';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $command, $inputRule, $markSchema, $node, $nodeSchema, $prose, $view } from '@milkdown/kit/utils';

import rules from '../../format/rules.json' with { type: 'json' };
import { CAPTION_NODE } from './format.js';
import { say } from './texts.js';

const LABEL_OF = { image: 'keptImage', embed: 'keptEmbed', directive: 'keptDirective', html: 'keptHtml', other: 'keptOther' };
const ANCHOR = new RegExp(rules.elements.heading.anchor);
const NON_BREAKING = ' ';

// A later element, or one its type does not take: its own bytes, shown as they stand.
export const keptBlock = $nodeSchema('konzilo_kept', () => ({
  group: 'block',
  atom: true,
  isolating: true,
  selectable: true,
  draggable: true,
  attrs: { value: { default: '', validate: 'string' }, kind: { default: 'other', validate: 'string' } },
  parseDOM: [
    {
      tag: 'div[data-konzilo-kept]',
      getAttrs: (dom) => ({ value: dom.dataset.value ?? '', kind: dom.dataset.kind ?? 'other' }),
    },
  ],
  toDOM: ({ attrs: { value, kind } }) => [
    'div',
    { class: 'konzilo-kept', 'data-konzilo-kept': '', 'data-kind': kind, 'data-value': value, contenteditable: 'false' },
    ['div', { class: 'konzilo-kept-label' }, say(LABEL_OF[kind] ?? LABEL_OF.other)],
    ['pre', value],
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'konziloKept',
    runner: (state, node, type) => state.addNode(type, { value: node.value, kind: node.kind }),
  },
  toMarkdown: {
    match: (node) => node.type.name === 'konzilo_kept',
    runner: (state, node) => state.addNode('html', undefined, node.attrs.value),
  },
}));

// An image stands at the top of a body, never in a quote or a list, so that is all the schema
// lets it do, by a group of its own beside the blocks.
const TOP_ONLY = 'konzilo_top';

export const bodyDocument = (withImages) => $node('doc', () => ({
  content: withImages ? `(block | ${TOP_ONLY})+` : 'block+',
  parseMarkdown: {
    match: ({ type }) => type === 'root',
    runner: (state, node, type) => state.injectRoot(node, type),
  },
  toMarkdown: {
    match: (node) => node.type.name === 'doc',
    runner: (state, node) => {
      state.openNode('root');
      // The last empty paragraph is where the cursor can stand, and no content.
      const last = node.lastChild;
      state.next(last?.type.name === 'paragraph' && last.content.size === 0 ? node.content.cut(0, node.content.size - last.nodeSize) : node.content);
    },
  },
}));

const IMAGE = 'konzilo_image';

// An image in a body: its address and alt text as attributes, and its caption as what it holds,
// so that the schema itself keeps a caption to what the format lets it take: no link, line break
// or footnote. It is written as the format has it, and the writer's `image` takes its alt text.
export const imageNode = $nodeSchema(IMAGE, () => ({
  group: TOP_ONLY,
  content: '(text | html)*',
  marks: 'strong emphasis inlineCode konzilo_superscript konzilo_subscript',
  isolating: true,
  defining: true,
  draggable: true,
  selectable: true,
  attrs: { src: { validate: 'string' }, alt: { default: '', validate: 'string' } },
  parseDOM: [
    {
      tag: 'figure[data-konzilo-image]',
      contentElement: 'figcaption',
      getAttrs: (dom) => ({ src: dom.dataset.src ?? '', alt: dom.dataset.alt ?? '' }),
    },
  ],
  toDOM: ({ attrs: { src, alt } }) => ['figure', { 'data-konzilo-image': '', 'data-src': src, 'data-alt': alt }, ['figcaption', 0]],
  parseMarkdown: {
    match: ({ type }) => type === 'konziloImage',
    runner: (state, node, type) => {
      state.openNode(type, { src: node.src, alt: node.alt });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === IMAGE,
    runner: (state, node) => {
      state.openNode('paragraph');
      state.addNode('image', undefined, undefined, { url: node.attrs.src, alt: node.attrs.alt });
      // A caption of spaces alone is no caption: a page would show nothing of it.
      if (node.textContent.trim() !== '' || node.childCount > 1) {
        state.addNode('break');
        state.openNode(CAPTION_NODE);
        state.next(node.content);
        state.closeNode();
      }
      state.closeNode();
    },
  },
}));

// Whether the selection is in an image's caption.
export const inImageCaption = ({ selection: { $from } }) => $from.parent.type.name === IMAGE;

// An image in the body: `chosen`, what the chooser gave, in place of an empty block, or after
// the block at the cursor, with the cursor after it, so that writing can go on.
export const insertImage = $command('KonziloInsertImage', (ctx) => (chosen) => (state, dispatch) => {
  if (!chosen) return false;
  if (!dispatch) return true;
  const { $from } = state.selection;
  const at = $from.depth === 0 ? $from.pos : $from.before(1);
  const block = state.doc.nodeAt(at);
  const empty = block?.type === state.schema.nodes.paragraph && block.content.size === 0;
  const caption = chosen.caption ? state.schema.text(chosen.caption) : null;
  const image = imageNode.type(ctx).create({ src: chosen.src, alt: chosen.alt }, caption);
  const place = empty ? at : at + (block?.nodeSize ?? 0);
  const tr = empty ? state.tr.replaceWith(at, at + block.nodeSize, image) : state.tr.insert(place, image);
  const after = place + image.nodeSize;
  if (after >= tr.doc.content.size) tr.insert(after, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1))).scrollIntoView());
  return true;
});

// Nothing turns an image into another kind of block, as the heading or code keys would, or a typed
// "```" in its caption, or either with a selection that takes in more. Such a change replaces a
// block around what it holds, which is also how an alt text changes, so it goes by what the block
// would become.
export const imageStaysAnImage = $prose(() => new Plugin({
  key: new PluginKey('KONZILO_IMAGE_STAYS'),
  filterTransaction: (tr) => !tr.steps.some((step, index) => step.gapFrom !== undefined && tr.docs[index].nodeAt(step.from)?.type.name === IMAGE && step.slice.content.firstChild?.type.name !== IMAGE),
}));

// How an image shows in the field: its picture, its caption in place below it, the text it holds
// for those who cannot see it, and a way to take it out. What it shows of the picture is small,
// and there is an image of it only as `picture` can find one.
function imageControls(initial, view, getPos, picture) {
  let node = initial;
  const made = (tag, className, parent) => {
    const element = document.createElement(tag);
    element.className = className;
    parent?.append(element);
    return element;
  };
  const dom = made('figure', 'konzilo-image');
  dom.dataset.src = node.attrs.src;
  const shown = made('div', 'konzilo-image-picture', dom);
  shown.contentEditable = 'false';
  const img = made('img', '', shown);
  img.alt = '';
  img.draggable = false;
  const remove = made('button', 'konzilo-image-remove', shown);
  remove.type = 'button';
  remove.textContent = say('imageRemove');
  const caption = made('figcaption', 'konzilo-image-caption', dom);
  caption.dataset.placeholder = say('imageCaptionHint');
  const textRow = made('label', 'konzilo-image-alt', dom);
  textRow.contentEditable = 'false';
  made('span', '', textRow).textContent = say('imageAlt');
  const input = made('input', '', textRow);
  input.type = 'text';
  input.spellcheck = true;

  let asked = null;
  const showPicture = (src) => {
    if (src === asked) return;
    asked = src;
    shown.dataset.state = 'loading';
    void Promise.resolve(picture?.(src)).catch(() => null).then((address) => {
      if (src !== asked) return;
      if (address) img.src = address;
      else img.removeAttribute('src');
      shown.dataset.state = address ? 'shown' : 'none';
    });
  };
  const showTexts = () => {
    if (input.value !== node.attrs.alt) input.value = node.attrs.alt;
    input.setAttribute('aria-invalid', String(node.attrs.alt.trim() === ''));
    caption.classList.toggle('is-empty', node.content.size === 0);
  };

  input.addEventListener('input', () => {
    const pos = getPos();
    if (pos === undefined) return;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt: input.value }));
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const pos = getPos();
    if (pos === undefined) return;
    view.focus();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1 + node.content.size)));
  });
  remove.addEventListener('click', () => {
    const pos = getPos();
    if (pos === undefined) return;
    view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
    view.focus();
  });

  showPicture(node.attrs.src);
  showTexts();
  return {
    dom,
    contentDOM: caption,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      showPicture(node.attrs.src);
      showTexts();
      return true;
    },
    stopEvent: ({ target }) => shown.contains(target) || textRow.contains(target),
    ignoreMutation: ({ target }) => !caption.contains(target),
  };
}

export const imageView = (picture) => $view(imageNode.node, () => (node, view, getPos) => imageControls(node, view, getPos, picture));

// A quote's attribution: its last block, in raw `<cite>`, without a line break. Its attribute
// has no default, or Enter in a quote would take a citation for the next block.
const CITED = { cited: true };

export const citation = $nodeSchema('konzilo_citation', () => ({
  content: 'inline*',
  defining: true,
  attrs: { cited: { validate: 'boolean' } },
  parseDOM: [{ tag: 'cite[data-konzilo-citation]', attrs: CITED }, { tag: 'blockquote > cite', attrs: CITED }],
  toDOM: () => ['cite', { 'data-konzilo-citation': '' }, 0],
  parseMarkdown: {
    match: ({ type }) => type === 'konziloCitation',
    runner: (state, node, type) => {
      state.openNode(type, CITED);
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'konzilo_citation',
    runner: (state, node) => {
      if (node.content.size === 0) return;
      state.openNode('paragraph');
      state.addNode('html', undefined, '<cite>');
      state.next(node.content);
      state.addNode('html', undefined, '</cite>');
      state.closeNode();
    },
  },
}));

export const quoteWithCitation = blockquoteSchema.extendSchema((prev) => (ctx) => ({
  ...prev(ctx),
  content: 'block+ konzilo_citation?',
}));

// A heading has levels 2 to 6 and an anchor. A pasted `<h1>` is reduced to level 2, and a
// heading keeps no id of Milkdown's, which could collide with the editor's own page.
export const headingWithAnchor = headingSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx);
  return {
    ...base,
    attrs: { ...base.attrs, level: { default: 2, validate: 'number' }, anchor: { default: '', validate: 'string' } },
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      getAttrs: (dom) => ({ level: Math.max(level, 2), anchor: dom.dataset?.anchor ?? '' }),
    })),
    toDOM: (node) => [`h${node.attrs.level}`, node.attrs.anchor ? { 'data-anchor': node.attrs.anchor } : {}, 0],
    parseMarkdown: {
      match: base.parseMarkdown.match,
      runner: (state, node, type) => {
        state.openNode(type, { level: node.depth, anchor: node.anchor ?? '' });
        state.next(node.children);
        state.closeNode();
      },
    },
    toMarkdown: {
      match: base.toMarkdown.match,
      runner: (state, node) => {
        state.openNode('heading', undefined, { depth: node.attrs.level });
        if (node.attrs.anchor) state.addNode('html', undefined, `<a id="${node.attrs.anchor}"></a>`);
        state.next(node.content);
        state.closeNode();
      },
    },
  };
});

// Typing `## ` makes a heading at level 2 to 6; `# ` stays what it is, text.
export const headingInputRule = $inputRule((ctx) => new InputRule(/^(#{2,6})\s$/, (state, match, start, end) => {
  const $start = state.doc.resolve(start);
  const type = headingSchema.type(ctx);
  if ($start.parent.type.name === IMAGE || !$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), type)) return null;
  return state.tr.delete(start, end).setBlockType(start, start, type, { level: match[1].length });
}));

// The order marks nest in when they are written, outermost first: a link stays one link
// whatever formats its text holds, and a run stays open across what lies within it. Code,
// at Milkdown's own 100, is innermost.
const withPriority = (schema, priority) => schema.extendSchema((prev) => (ctx) => ({ ...prev(ctx), priority }));

export const markOrder = [
  withPriority(linkSchema, 10),
  withPriority(strongSchema, 40),
  withPriority(emphasisSchema, 50),
  withPriority(strikethroughSchema, 60),
];

const markOf = (name, tag, markdown) => $markSchema(name, () => ({
  priority: 20,
  parseDOM: [{ tag, getAttrs: (dom) => (dom.dataset?.type ? false : null) }],
  toDOM: () => [tag, 0],
  parseMarkdown: {
    match: ({ type }) => type === markdown,
    runner: (state, node, type) => {
      state.openMark(type);
      state.next(node.children);
      state.closeMark(type);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === name,
    runner: (state, mark) => {
      state.withMark(mark, markdown);
    },
  },
}));

export const superscript = markOf('konzilo_superscript', 'sup', 'superscript');
export const subscript = markOf('konzilo_subscript', 'sub', 'subscript');

export const toggleSuperscript = $command('KonziloToggleSuperscript', (ctx) => () => toggleMark(superscript.type(ctx)));
export const toggleSubscript = $command('KonziloToggleSubscript', (ctx) => () => toggleMark(subscript.type(ctx)));

// A citation, from the paragraph that is its quote's last block, and back.
export const toggleCitation = $command('KonziloToggleCitation', (ctx) => () => (state, dispatch, view) => {
  const { $from } = state.selection;
  if ($from.depth < 2 || $from.node(-1).type.name !== 'blockquote') return false;
  const { paragraph } = state.schema.nodes;
  if ($from.parent.type === citation.type(ctx)) return setBlockType(paragraph)(state, dispatch, view);
  if ($from.parent.type !== paragraph) return false;
  return setBlockType(citation.type(ctx), CITED)(state, dispatch, view);
});

// A pos's ancestors hold none of these where a mark may stand: never in a heading, a
// link's text, a table, a citation or another footnote's text.
const NO_MARK_IN = new Set(['heading', 'table', 'konzilo_citation', 'footnote_definition', 'code_block', IMAGE]);

export function canMarkFootnote({ selection: { $from } }) {
  for (let depth = $from.depth; depth > 0; depth -= 1) if (NO_MARK_IN.has($from.node(depth).type.name)) return false;
  return true;
}

// A footnote: its mark at the cursor, its text in a block at the end, where the cursor goes.
export const insertFootnote = $command('KonziloInsertFootnote', () => () => (state, dispatch) => {
  if (!canMarkFootnote(state)) return false;
  if (!dispatch) return true;
  const { footnote_reference: mark, footnote_definition: definition, paragraph } = state.schema.nodes;
  let most = 0;
  state.doc.descendants((node) => {
    if (node.type === mark || node.type === definition) most = Math.max(most, Number(node.attrs.label) || 0);
  });
  const label = String(most + 1);
  const tr = state.tr.insert(state.selection.to, mark.create({ label }));
  const end = tr.doc.content.size;
  tr.insert(end, definition.create({ label }, paragraph.create()));
  tr.setSelection(TextSelection.create(tr.doc, end + 2)).scrollIntoView();
  dispatch(tr);
  return true;
});

// A footnote whose mark goes takes its text along, so that marks and texts stay in step.
export const footnotesInStep = $prose(() => new Plugin({
  key: new PluginKey('KONZILO_FOOTNOTES'),
  appendTransaction(transactions, before, state) {
    if (!transactions.some((tr) => tr.docChanged)) return null;
    const marksIn = (doc) => {
      const labels = new Set();
      doc.descendants((node) => {
        if (node.type.name === 'footnote_reference') labels.add(node.attrs.label);
      });
      return labels;
    };
    const [was, is] = [marksIn(before.doc), marksIn(state.doc)];
    const gone = [...was].filter((label) => !is.has(label));
    if (gone.length === 0) return null;
    const ranges = [];
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'footnote_definition' && gone.includes(node.attrs.label)) ranges.push([pos, pos + node.nodeSize]);
      return node.isBlock && node.type.name !== 'footnote_definition';
    });
    if (ranges.length === 0) return null;
    const tr = state.tr;
    for (const [from, to] of ranges.reverse()) tr.delete(from, to);
    return tr;
  },
}));

// The level 1 heading is not on offer, whichever way a change would make one.
export const noLevelOne = $prose(() => new Plugin({
  key: new PluginKey('KONZILO_NO_LEVEL_ONE'),
  filterTransaction(tr) {
    if (!tr.docChanged) return true;
    return !tr.steps.some((step) => {
      let found = false;
      step.slice?.content.descendants((node) => {
        found ||= node.type.name === 'heading' && node.attrs.level === 1;
      });
      return found;
    });
  },
}));

const atStartOf = (state, name) => {
  const { empty, $from } = state.selection;
  return empty && $from.parentOffset === 0 && $from.parent.type.name === name;
};

export const fieldKeys = $prose((ctx) => keymap({
  // A non-breaking space, as the character. A Mac's Option-Space types one itself.
  'Mod-Shift-Space': (state, dispatch) => {
    dispatch?.(state.tr.insertText(NON_BREAKING).scrollIntoView());
    return true;
  },
  // A heading goes back to a paragraph, not to the level above, which would end at level 1. A
  // citation does too, or the browser would merge it upward and leave its italics as a mark.
  Backspace: (state, dispatch, view) => (atStartOf(state, 'heading') || atStartOf(state, 'konzilo_citation') ? setBlockType(state.schema.nodes.paragraph)(state, dispatch, view) : false),
  // A citation is its quote's last block, and a caption is one line, so Enter leaves them.
  Enter: (state, dispatch) => {
    const { $from } = state.selection;
    if ($from.parent.type.name !== 'konzilo_citation' && $from.parent.type.name !== IMAGE) return false;
    const after = $from.parent.type.name === IMAGE ? $from.after() : $from.after(-1);
    if (dispatch) {
      const tr = state.tr.insert(after, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
    }
    return true;
  },
  'Mod-Alt-f': () => ctx.get(commandsCtx).call(insertFootnote.key),
}));

function anchorControl(view, getPos, anchor) {
  const holder = document.createElement('span');
  holder.className = 'konzilo-anchor';
  holder.contentEditable = 'false';
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = anchor ? 'konzilo-anchor-badge has-anchor' : 'konzilo-anchor-badge';
  badge.textContent = anchor ? `#${anchor}` : '#';
  badge.title = say('anchorAdd');
  badge.setAttribute('aria-label', say('anchorAdd'));
  holder.append(badge);
  badge.addEventListener('mousedown', (event) => event.preventDefault());
  badge.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'konzilo-anchor-input';
    input.value = anchor;
    input.placeholder = say('anchorHint');
    input.setAttribute('aria-label', say('anchorHint'));
    badge.replaceWith(input);
    input.focus();
    // Taking the input away blurs it, so its end comes once.
    let ended = false;
    const end = (save) => {
      if (ended) return;
      ended = true;
      const { value } = input;
      input.replaceWith(badge);
      if (save && ANCHOR.test(value) && value !== anchor) {
        const pos = getPos() - 1;
        const node = view.state.doc.nodeAt(pos);
        if (node?.type.name === 'heading') view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, anchor: value }));
      }
      view.focus();
    };
    input.addEventListener('input', () => input.setCustomValidity(''));
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter' && !ANCHOR.test(input.value)) {
        input.setCustomValidity(say('anchorHint'));
        input.reportValidity();
        return;
      }
      end(event.key === 'Enter');
    });
    input.addEventListener('blur', () => end(true));
  });
  return holder;
}

function marksOf(doc, withAnchors) {
  const found = [];
  doc.descendants((node, pos) => {
    if (withAnchors && node.type.name === 'heading') {
      const { anchor } = node.attrs;
      found.push(Decoration.widget(pos + 1, (view, getPos) => anchorControl(view, getPos, anchor), {
        side: -1,
        ignoreSelection: true,
        stopEvent: () => true,
        key: `anchor-${anchor}`,
      }));
    }
    if (node.isText && node.text.includes(NON_BREAKING)) {
      for (const { index } of node.text.matchAll(/ /g)) found.push(Decoration.inline(pos + index, pos + index + 1, { class: 'konzilo-nbsp' }));
    }
    return !node.isText;
  });
  return DecorationSet.create(doc, found);
}

// A heading's anchor as a badge, and each non-breaking space made visible.
export const fieldMarks = (withAnchors) => $prose(() => {
  const key = new PluginKey('KONZILO_MARKS');
  return new Plugin({
    key,
    state: {
      init: (_, { doc }) => marksOf(doc, withAnchors),
      apply: (tr, old) => (tr.docChanged ? marksOf(tr.doc, withAnchors) : old),
    },
    props: { decorations: (state) => key.getState(state) },
  });
});

// Each real change to the document, for the field to write it.
export const onDocumentChange = (changed) => $prose(() => new Plugin({
  key: new PluginKey('KONZILO_CHANGES'),
  view: () => ({
    update(view, before) {
      if (!view.state.doc.eq(before.doc)) changed();
    },
  }),
}));
