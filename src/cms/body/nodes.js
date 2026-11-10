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
import { made } from './dialog.js';
import { embedOf } from '../../format/embeds.js';
import { editEmbed } from './embed-edit.js';
import { CAPTION_NODE, LINE_NODE } from './format.js';
import { editGallery } from './gallery-edit.js';
import { editImage } from './image-edit.js';
import { say } from './texts.js';

const LABEL_OF = { image: 'keptImage', list: 'keptList', embed: 'keptEmbed', directive: 'keptDirective', html: 'keptHtml', other: 'keptOther' };
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

// An image or an embed stands at the top of a body, never in a quote or a list, so that is all the
// schema lets it do, by a group of its own beside the blocks.
const TOP_ONLY = 'konzilo_top';

export const bodyDocument = (withTopOnly) => $node('doc', () => ({
  content: withTopOnly ? `(block | ${TOP_ONLY})+` : 'block+',
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
const GALLERY = 'konzilo_gallery';
const GALLERY_CAPTION = 'konzilo_gallery_caption';
const CAPTIONS = new Set([IMAGE, GALLERY_CAPTION]);
const CAPTION_CONTENT = '(text | html)*';
const CAPTION_MARKS = 'strong emphasis inlineCode konzilo_superscript konzilo_subscript';

// A caption of spaces alone is no caption: a page would show nothing of it.
const hasCaption = (node) => node.textContent.trim() !== '' || node.childCount > 1;

const writeCaption = (state, node) => {
  state.openNode(CAPTION_NODE);
  state.next(node.content);
  state.closeNode();
};

const writeImage = (state, node) => {
  state.addNode('image', undefined, undefined, { url: node.attrs.src, alt: node.attrs.alt });
  if (hasCaption(node)) {
    state.addNode('break');
    writeCaption(state, node);
  }
};

// An image in a body: its address and alt text as attributes, and its caption as what it holds,
// so that the schema itself keeps a caption to what the format lets it take: no link, line break
// or footnote. It is written as the format has it, and the writer's `image` takes its alt text.
export const imageNode = $nodeSchema(IMAGE, () => ({
  group: TOP_ONLY,
  content: CAPTION_CONTENT,
  marks: CAPTION_MARKS,
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
      writeImage(state, node);
      state.closeNode();
    },
  },
}));

// A gallery's own caption, which it always has a place for, and writes when it holds something.
export const galleryCaption = $nodeSchema(GALLERY_CAPTION, () => ({
  content: CAPTION_CONTENT,
  marks: CAPTION_MARKS,
  isolating: true,
  defining: true,
  parseDOM: [{ tag: 'figcaption[data-konzilo-gallery-caption]' }],
  toDOM: () => ['figcaption', { 'data-konzilo-gallery-caption': '' }, 0],
  parseMarkdown: {
    match: ({ type }) => type === 'konziloGalleryCaption',
    runner: (state, node, type) => {
      state.openNode(type);
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === GALLERY_CAPTION,
    runner: writeCaption,
  },
}));

// A gallery in a body: its images, as images are anywhere, and its own caption. It is written as
// one paragraph, a line for each, as the format has it. How few images it holds is not the
// schema's to say, which would have to be able to make one up: see `galleriesHoldTwo`.
export const galleryNode = $nodeSchema(GALLERY, () => ({
  group: TOP_ONLY,
  content: `${IMAGE}* ${GALLERY_CAPTION}`,
  isolating: true,
  defining: true,
  draggable: true,
  selectable: true,
  parseDOM: [{ tag: 'figure[data-konzilo-gallery]' }],
  toDOM: () => ['figure', { 'data-konzilo-gallery': '' }, 0],
  parseMarkdown: {
    match: ({ type }) => type === 'konziloGallery',
    runner: (state, node, type) => {
      state.openNode(type);
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === GALLERY,
    runner: (state, node) => {
      state.openNode('paragraph');
      node.forEach((child, _, index) => {
        const isImage = child.type.name === IMAGE;
        if (!isImage && !hasCaption(child)) return;
        if (index > 0) state.addNode(LINE_NODE);
        if (isImage) writeImage(state, child);
        else writeCaption(state, child);
      });
      state.closeNode();
    },
  },
}));

const EMBED = 'konzilo_embed';

// An address as a paragraph holds it: bare, or in angle brackets where a bare one might not read
// back whole, since Markdown ends it before what a sentence could end with.
const writtenAddress = (address) => (/^[^\s<>]*[\p{L}\p{N}/]$/u.test(address) ? address : `<${address}>`);

// An embed in a body: its address, and how it is written, so that it stays as it was.
export const embedNode = $nodeSchema(EMBED, () => ({
  group: TOP_ONLY,
  atom: true,
  isolating: true,
  selectable: true,
  draggable: true,
  attrs: { address: { validate: 'string' }, value: { validate: 'string' } },
  parseDOM: [
    {
      tag: 'div[data-konzilo-embed]',
      getAttrs: (dom) => ({ address: dom.dataset.address ?? '', value: dom.dataset.value ?? '' }),
    },
  ],
  toDOM: ({ attrs: { address, value } }) => ['div', { 'data-konzilo-embed': '', 'data-address': address, 'data-value': value }],
  parseMarkdown: {
    match: ({ type }) => type === 'konziloEmbed',
    runner: (state, node, type) => state.addNode(type, { address: node.address, value: node.value }),
  },
  toMarkdown: {
    match: (node) => node.type.name === EMBED,
    runner: (state, node) => state.addNode('html', undefined, node.attrs.value),
  },
}));

// Whether text alone is an address the site embeds.
export const isEmbeddable = (text) => /^https:\/\/\S+$/.test(text) && !embedOf(text, rules).reason;

// Whether the selection is in an empty block at the top of a body, where an embed can take its place.
export const atEmptyTopBlock = ({ selection: { empty, $from }, schema }) => empty && $from.depth === 1 && $from.parent.type === schema.nodes.paragraph && $from.parent.content.size === 0;

// Whether the selection is in the caption of an image or a gallery.
export const inImageCaption = ({ selection: { $from } }) => CAPTIONS.has($from.parent.type.name);

const imageOf = ({ schema }, chosen) => schema.nodes[IMAGE].create({ src: chosen.src, alt: chosen.alt }, chosen.caption ? schema.text(chosen.caption) : null);

// A block in place of an empty block, or after the block at the cursor, with the cursor after it,
// so that writing can go on.
function putAtCursor(state, dispatch, node) {
  const { $from } = state.selection;
  const at = $from.depth === 0 ? $from.pos : $from.before(1);
  const block = state.doc.nodeAt(at);
  const empty = block?.type === state.schema.nodes.paragraph && block.content.size === 0;
  const place = empty ? at : at + (block?.nodeSize ?? 0);
  const tr = empty ? state.tr.replaceWith(at, at + block.nodeSize, node) : state.tr.insert(place, node);
  const after = place + node.nodeSize;
  if (after >= tr.doc.content.size) tr.insert(after, state.schema.nodes.paragraph.create());
  dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1))).scrollIntoView());
}

// An image in the body, from what the chooser gave.
export const insertImage = $command('KonziloInsertImage', () => (chosen) => (state, dispatch) => {
  if (!chosen) return false;
  if (dispatch) putAtCursor(state, dispatch, imageOf(state, chosen));
  return true;
});

// An embed in the body, of an address the dialog or a paste gave.
export const insertEmbed = $command('KonziloInsertEmbed', () => (address) => (state, dispatch) => {
  if (!address) return false;
  if (dispatch) putAtCursor(state, dispatch, state.schema.nodes[EMBED].create({ address, value: writtenAddress(address) }));
  return true;
});

// A gallery in the body, from what the chooser gave, or the image, when it was one.
export const insertGallery = $command('KonziloInsertGallery', () => (chosen) => (state, dispatch) => {
  if (!chosen?.length) return false;
  if (!dispatch) return true;
  const images = chosen.map((one) => imageOf(state, one));
  putAtCursor(state, dispatch, images.length === 1 ? images[0] : state.schema.nodes[GALLERY].createAndFill(null, images));
  return true;
});

// Nothing turns an image or a caption into another kind of block, as the heading or code keys
// would, or a typed "```", or either with a selection that takes in more. Such a change replaces a
// block around what it holds, which is also how an alt text changes, so it goes by what the block
// would become.
export const imageStaysAnImage = $prose(() => new Plugin({
  key: new PluginKey('KONZILO_IMAGE_STAYS'),
  filterTransaction: (tr) => !tr.steps.some((step, index) => {
    if (step.gapFrom === undefined) return false;
    const name = tr.docs[index].nodeAt(step.from)?.type.name;
    return CAPTIONS.has(name) && step.slice.content.firstChild?.type.name !== name;
  }),
}));

// A gallery is two images or more. One left is that image, with the gallery's caption where it has
// none of its own, as the format has no other place for it, and with none there is no gallery.
export const galleriesHoldTwo = $prose(() => new Plugin({
  key: new PluginKey('KONZILO_GALLERIES_HOLD_TWO'),
  appendTransaction: (transactions, _, { doc, tr }) => {
    if (!transactions.some(({ docChanged }) => docChanged)) return null;
    const alone = [];
    doc.forEach((node, offset) => {
      if (node.type.name === GALLERY && node.childCount <= 2) alone.push({ node, offset });
    });
    for (const { node, offset } of alone.reverse()) {
      const { firstChild: image, lastChild: caption } = node;
      if (image === caption) tr.delete(offset, offset + node.nodeSize);
      else tr.replaceWith(offset, offset + node.nodeSize, image.content.size === 0 ? image.copy(caption.content) : image);
    }
    return alone.length > 0 ? tr : null;
  },
}));

const PEN_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.06 9.02L14.98 9.94L5.92 19H5V18.08L14.06 9.02ZM17.66 3C17.41 3 17.15 3.1 16.96 3.29L15.13 5.12L18.88 8.87L20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C18.17 3.09 17.92 3 17.66 3ZM14.06 6.19L3 17.25V21H6.75L17.81 9.94L14.06 6.19Z"/></svg>';

const penOn = (parent, words, run) => {
  const pen = made('button', 'konzilo-image-edit', parent);
  pen.type = 'button';
  pen.title = words;
  pen.setAttribute('aria-label', words);
  pen.innerHTML = PEN_ICON;
  pen.addEventListener('mousedown', (event) => event.preventDefault());
  pen.addEventListener('click', run);
  return pen;
};

// How an image shows in the field: its picture, small, as `picture` can find one, its caption in
// place below it, and on the picture one button, to what else there is to do with it, which in a
// gallery is the gallery's. What it says for those who cannot see it shows only when the picture
// does not, or when it says nothing.
function imageControls(initial, view, getPos, picture) {
  let node = initial;
  const dom = made('figure', 'konzilo-image');
  dom.dataset.src = node.attrs.src;
  const shown = made('div', 'konzilo-image-picture', dom);
  shown.contentEditable = 'false';
  const img = made('img', '', shown);
  img.alt = '';
  img.draggable = false;
  const words = made('span', 'konzilo-image-words', shown);
  const caption = made('figcaption', 'konzilo-image-caption', dom);
  caption.dataset.placeholder = say('imageCaptionHint');

  const showWords = () => {
    const alt = node.attrs.alt.trim();
    words.toggleAttribute('data-missing', alt === '');
    words.textContent = alt === '' ? say('imageNoAltYet') : alt;
    words.hidden = alt !== '' && shown.dataset.state !== 'none';
  };
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
      showWords();
    });
  };
  const showTexts = () => {
    img.alt = node.attrs.alt;
    img.title = node.attrs.alt;
    showWords();
    caption.classList.toggle('is-empty', node.content.size === 0);
  };

  if (view.state.doc.resolve(getPos()).parent.type.name !== GALLERY) {
    penOn(shown, say('imageEdit'), async () => {
      const answer = await editImage({ alt: node.attrs.alt, address: shown.dataset.state === 'shown' ? img.src : null });
      if (view.isDestroyed) return;
      const pos = getPos();
      if (answer !== null && pos !== undefined) {
        if (answer.remove) view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
        else if (answer.alt !== node.attrs.alt) view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, alt: answer.alt }));
      }
      view.focus();
    });
  }

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
    stopEvent: ({ target }) => shown.contains(target),
    ignoreMutation: ({ target }) => !caption.contains(target),
  };
}

export const imageView = (picture) => $view(imageNode.node, () => (node, view, getPos) => imageControls(node, view, getPos, picture));

// How a gallery shows in the field: its images side by side, each caption in place, its own caption
// below them, and one pen, to all else there is to do with it.
function galleryControls(initial, view, getPos, images) {
  let node = initial;
  const dom = made('figure', 'konzilo-gallery-field');
  const contentDOM = made('div', 'konzilo-gallery-images', dom);
  const pen = penOn(dom, say('galleryEdit'), async () => {
    const held = [];
    node.forEach((child) => {
      if (child.type.name === IMAGE) held.push({ kept: child, src: child.attrs.src, alt: child.attrs.alt });
    });
    const answer = await editGallery({ images: held, choose: images?.chooseSeveral ?? null, picture: images?.picture ?? null });
    if (view.isDestroyed) return;
    const pos = getPos();
    if (answer !== null && pos !== undefined) {
      const start = pos + 1;
      const end = pos + node.nodeSize - 1 - node.lastChild.nodeSize;
      if (answer.remove) view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
      else if (answer.images.length !== held.length || answer.images.some(({ kept, alt }, index) => kept !== held[index].kept || alt !== held[index].alt)) {
        const rebuilt = answer.images.map((one) => (one.kept ? one.kept.type.create({ ...one.kept.attrs, alt: one.alt }, one.kept.content) : imageOf(view.state, one)));
        view.dispatch(rebuilt.length > 0 ? view.state.tr.replaceWith(start, end, rebuilt) : view.state.tr.delete(start, end));
      }
    }
    view.focus();
  });
  pen.contentEditable = 'false';
  pen.classList.add('konzilo-gallery-edit');

  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      return true;
    },
    stopEvent: ({ target }) => pen.contains(target),
    ignoreMutation: ({ target }) => !contentDOM.contains(target),
  };
}

// How an embed shows in the field: the service's name and the address, and the pen. Nothing is
// asked of the service, in the field as on a page before a visitor consents.
function embedControls(initial, view, getPos) {
  let node = initial;
  const dom = made('div', 'konzilo-embed-field');
  dom.contentEditable = 'false';
  const name = made('strong', 'konzilo-embed-service', dom);
  const where = made('span', 'konzilo-embed-address', dom);
  const show = () => {
    name.textContent = embedOf(node.attrs.address, rules).name ?? '';
    where.textContent = node.attrs.address;
  };
  const pen = penOn(dom, say('embedEdit'), async () => {
    const answer = await editEmbed({ address: node.attrs.address });
    if (view.isDestroyed) return;
    const pos = getPos();
    if (answer !== null && pos !== undefined) {
      if (answer.remove) view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
      else if (answer.address !== node.attrs.address) view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { address: answer.address, value: writtenAddress(answer.address) }));
    }
    view.focus();
  });
  show();
  return {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      show();
      return true;
    },
    stopEvent: ({ target }) => pen.contains(target),
    ignoreMutation: () => true,
  };
}

export const embedView = $view(embedNode.node, () => (node, view, getPos) => embedControls(node, view, getPos));

export const galleryView = (images) => $view(galleryNode.node, () => (node, view, getPos) => galleryControls(node, view, getPos, images));

export const galleryCaptionView = $view(galleryCaption.node, () => (initial) => {
  let node = initial;
  const dom = made('figcaption', 'konzilo-gallery-caption');
  dom.dataset.placeholder = say('galleryCaptionHint');
  const showEmpty = () => dom.classList.toggle('is-empty', node.content.size === 0);
  showEmpty();
  return {
    dom,
    contentDOM: dom,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      showEmpty();
      return true;
    },
    ignoreMutation: ({ type }) => type === 'attributes',
  };
});

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
  if (CAPTIONS.has($start.parent.type.name) || !$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), type)) return null;
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
const NO_MARK_IN = new Set(['heading', 'table', 'konzilo_citation', 'footnote_definition', 'code_block', ...CAPTIONS]);

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
  // A citation is its quote's last block, and a caption is one line, so Enter leaves them: for the
  // next caption in a gallery, and otherwise for a new block after what holds them.
  Enter: (state, dispatch) => {
    const { $from } = state.selection;
    const { name } = $from.parent.type;
    if (name !== 'konzilo_citation' && !CAPTIONS.has(name)) return false;
    if (name === IMAGE && $from.node(-1).type.name === GALLERY) {
      dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, $from.after() + 1)).scrollIntoView());
      return true;
    }
    const after = name === IMAGE ? $from.after() : $from.after(-1);
    if (dispatch) {
      const tr = state.tr.insert(after, state.schema.nodes.paragraph.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
    }
    return true;
  },
  // A caption is one line, and a line break would carry what follows out of a gallery.
  'Shift-Enter': inImageCaption,
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
