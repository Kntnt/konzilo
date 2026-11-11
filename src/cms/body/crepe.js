// The editor itself: `CrepeBuilder` with the parts ADR 0030 names, and a type's elements
// deciding its schema, toolbar and block menu. Left out for every type: Crepe's image block,
// LaTeX, CodeMirror, the top bar and AI, a separator, a task list and an upload.

import { CrepeBuilder } from '@milkdown/crepe/builder';
import { blockEdit } from '@milkdown/crepe/feature/block-edit';
import { cursor } from '@milkdown/crepe/feature/cursor';
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip';
import { listItem } from '@milkdown/crepe/feature/list-item';
import { placeholder } from '@milkdown/crepe/feature/placeholder';
import { table as tableFeature } from '@milkdown/crepe/feature/table';
import { toolbar } from '@milkdown/crepe/feature/toolbar';
import { commandsCtx, editorViewCtx, editorViewOptionsCtx, parserCtx, remarkStringifyOptionsCtx, serializerCtx } from '@milkdown/kit/core';
import { blockConfig } from '@milkdown/kit/plugin/block';
import { uploadPlugin } from '@milkdown/kit/plugin/upload';
import {
  blockquoteAttr,
  blockquoteKeymap,
  blockquoteSchema,
  bulletListAttr,
  bulletListKeymap,
  bulletListSchema,
  clearTextInCurrentBlockCommand,
  hardbreakFilterNodes,
  codeBlockAttr,
  codeBlockKeymap,
  codeBlockSchema,
  createCodeBlockCommand,
  createCodeBlockInputRule,
  docSchema,
  headingAttr,
  headingKeymap,
  headingSchema,
  hrAttr,
  hrSchema,
  imageAttr,
  imageSchema,
  insertHrCommand,
  insertHrInputRule,
  insertImageCommand,
  isMarkSelectedCommand,
  listItemAttr,
  listItemKeymap,
  listItemSchema,
  orderedListAttr,
  orderedListKeymap,
  orderedListSchema,
  remarkPreserveEmptyLinePlugin,
  syncHeadingIdPlugin,
  syncListOrderPlugin,
  updateImageCommand,
  wrapInBlockquoteCommand,
  wrapInBlockquoteInputRule,
  wrapInBulletListCommand,
  wrapInBulletListInputRule,
  wrapInHeadingCommand,
  wrapInHeadingInputRule,
  wrapInOrderedListCommand,
  wrapInOrderedListInputRule,
} from '@milkdown/kit/preset/commonmark';
import {
  autoInsertSpanPlugin,
  extendListItemSchemaForTask,
  footnoteDefinitionSchema,
  footnoteReferenceSchema,
  insertTableCommand,
  insertTableInputRule,
  keepTableAlignPlugin,
  remarkGFMPlugin,
  tableCellSchema,
  tableEditingPlugin,
  tableHeaderRowSchema,
  tableHeaderSchema,
  tableRowSchema,
  tableSchema,
  wrapInTaskListInputRule,
} from '@milkdown/kit/preset/gfm';
import { findParent } from '@milkdown/kit/prose';
import { $remark } from '@milkdown/kit/utils';

import { editEmbed } from './embed-edit.js';
import { readFormat, writerOptions } from './format.js';
import {
  atEmptyTopBlock,
  bodyDocument,
  canMarkFootnote,
  citation,
  embedNode,
  embedView,
  fieldKeys,
  fieldMarks,
  footnotesInStep,
  galleriesHoldTwo,
  galleryCaption,
  galleryCaptionView,
  galleryNode,
  galleryView,
  headingInputRule,
  headingWithAnchor,
  imageNode,
  imageStaysAnImage,
  imageView,
  inImageCaption,
  insertEmbed,
  insertFootnote,
  insertGallery,
  insertImage,
  isEmbeddable,
  keptBlock,
  markOrder,
  noLevelOne,
  onDocumentChange,
  quoteWithCitation,
  subscript,
  superscript,
  toggleCitation,
  toggleSubscript,
  toggleSuperscript,
} from './nodes.js';
import { captionLine, inCell, oneLine, reducedText, reducePasted } from './paste.js';
import { blockAt } from './place.js';
import { say } from '../interface-language.js';

const ICON = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">${body}</svg>`;
const ICONS = {
  superscript: ICON('<path d="M5 6h2.5l3.5 5.2L14.5 6H17l-4.7 7L17 20h-2.5l-3.5-5.2L7.5 20H5l4.7-7z"/><path d="M21 8h-4V7l2.3-2.1c.5-.5.7-.8.7-1.1 0-.4-.3-.7-.8-.7-.5 0-.9.3-1.3.8l-.8-.8C17.7 2.4 18.5 2 19.3 2 20.5 2 21.3 2.7 21.3 3.8c0 .7-.3 1.2-1 1.8L18.9 6.9H21z"/>'),
  subscript: ICON('<path d="M5 4h2.5l3.5 5.2L14.5 4H17l-4.7 7L17 18h-2.5L11 12.8 7.5 18H5l4.7-7z"/><path d="M21 22h-4v-1l2.3-2.1c.5-.5.7-.8.7-1.1 0-.4-.3-.7-.8-.7-.5 0-.9.3-1.3.8l-.8-.8c.6-.7 1.4-1.1 2.2-1.1 1.2 0 2 .7 2 1.8 0 .7-.3 1.2-1 1.8L18.9 20.9H21z"/>'),
  footnote: ICON('<path d="M4 18h9v-2H4zm0-5h13v-2H4zm0-7v2h16V6z"/><path d="M19 12h2v8h-2z"/>'),
  citation: ICON('<path d="M4 6h16v2H4zm0 5h10v2H4zm9 5h7v2h-7z"/>'),
  embed: ICON('<path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm0 2v10h16V7zm6 2 5 3-5 3z"/>'),
  gallery: ICON('<path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2m-11-4 2.03 2.71L16 11l4 5H8zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6z"/>'),
  image: ICON('<path d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.587 1.413T19 21zm0-2h14V5H5zm1-2h12l-3.75-5-3 4L9 13zM5 19V5z"/>'),
};

// What an element brings, which goes when a type does not take it.
const PARTS = {
  heading: [headingAttr, headingSchema, wrapInHeadingCommand, headingKeymap],
  list: [bulletListAttr, bulletListSchema, bulletListKeymap, wrapInBulletListCommand, wrapInBulletListInputRule, orderedListAttr, orderedListSchema, orderedListKeymap, wrapInOrderedListCommand, wrapInOrderedListInputRule, listItemAttr, listItemSchema, listItemKeymap, syncListOrderPlugin, extendListItemSchemaForTask],
  quote: [blockquoteAttr, blockquoteSchema, blockquoteKeymap, wrapInBlockquoteCommand, wrapInBlockquoteInputRule],
  code: [codeBlockAttr, codeBlockSchema, codeBlockKeymap, createCodeBlockCommand, createCodeBlockInputRule],
  table: [tableSchema, tableHeaderRowSchema, tableRowSchema, tableHeaderSchema, tableCellSchema, insertTableCommand, insertTableInputRule, keepTableAlignPlugin, autoInsertSpanPlugin, tableEditingPlugin],
  footnotes: [footnoteDefinitionSchema, footnoteReferenceSchema],
};

// What no type has: a separator, an image of Milkdown's, a task list, an upload, a preserved
// empty line, an id on a heading, and a `# ` that makes a level 1 heading.
const NEVER = [docSchema, hrAttr, hrSchema, insertHrCommand, insertHrInputRule, imageAttr, imageSchema, insertImageCommand, updateImageCommand, wrapInTaskListInputRule, uploadPlugin, remarkPreserveEmptyLinePlugin, syncHeadingIdPlugin, wrapInHeadingInputRule];

const menu = (takes, images) => {
  const headings = takes('heading') ? {} : null;
  const withImages = takes('image') && images !== null;
  const withGalleries = withImages && takes('gallery');
  const item = (name) => ({ label: say(name) });
  return {
    // Close to its block, so that the field's left margin need not be wider than it is.
    blockHandle: { getOffset: () => 6 },
    textGroup: {
      label: say('body.textGroup'),
      text: item('body.text'),
      h1: null,
      h2: headings && item('body.heading2'),
      h3: headings && item('body.heading3'),
      h4: headings && item('body.heading4'),
      h5: headings && item('body.heading5'),
      h6: headings && item('body.heading6'),
      quote: takes('quote') ? item('body.quote') : null,
      divider: null,
    },
    listGroup: takes('list') ? { label: say('body.listGroup'), bulletList: item('body.bulletList'), orderedList: item('body.orderedList'), taskList: null } : null,
    advancedGroup: takes('code') || takes('table') || withImages || takes('embed')
      ? { label: say('body.moreGroup'), image: null, math: null, codeBlock: takes('code') ? item('body.code') : null, table: takes('table') ? item('body.table') : null }
      : null,
    buildMenu(builder) {
      if (takes('quote')) {
        builder.getGroup('text').addItem('citation', {
          label: say('body.citation'),
          icon: ICONS.citation,
          onRun: (ctx) => {
            const commands = ctx.get(commandsCtx);
            commands.call(clearTextInCurrentBlockCommand.key);
            commands.call(toggleCitation.key);
          },
        });
      }
      if (takes('embed')) {
        builder.getGroup('advanced').addItem('embed', {
          label: say('body.embed'),
          icon: ICONS.embed,
          onRun: (ctx) => {
            const commands = ctx.get(commandsCtx);
            commands.call(clearTextInCurrentBlockCommand.key);
            void editEmbed().then((answer) => {
              if (answer) commands.call(insertEmbed.key, answer.address);
              ctx.get(editorViewCtx).focus();
            }).catch((error) => console.warn(`The embed was not put in: ${error.message}`));
          },
        });
      }
      if (withImages) {
        builder.getGroup('advanced').addItem('image', {
          label: say('body.image'),
          icon: ICONS.image,
          onRun: (ctx) => {
            const commands = ctx.get(commandsCtx);
            commands.call(clearTextInCurrentBlockCommand.key);
            void images.choose().then((chosen) => {
              if (chosen) commands.call(insertImage.key, chosen);
              ctx.get(editorViewCtx).focus();
            }).catch((error) => console.warn(`The image was not put in: ${error.message}`));
          },
        });
      }
      if (withGalleries) {
        builder.getGroup('advanced').addItem('gallery', {
          label: say('body.gallery'),
          icon: ICONS.gallery,
          onRun: (ctx) => {
            const commands = ctx.get(commandsCtx);
            commands.call(clearTextInCurrentBlockCommand.key);
            void images.chooseSeveral().then((chosen) => {
              if (chosen) commands.call(insertGallery.key, chosen);
              ctx.get(editorViewCtx).focus();
            }).catch((error) => console.warn(`The gallery was not put in: ${error.message}`));
          },
        });
      }
    },
  };
};

const toolbarOptions = (takes) => ({
  boldLabel: say('body.bold'),
  italicLabel: say('body.italic'),
  strikethroughLabel: say('body.strikethrough'),
  codeLabel: say('body.inlineCode'),
  linkLabel: say('body.link'),
  buildToolbar(builder) {
    const group = builder.getGroup('formatting');
    const mark = (key, name, schema, command) => group.addItem(key, {
      icon: ICONS[key],
      label: say(name),
      active: (ctx) => ctx.get(commandsCtx).call(isMarkSelectedCommand.key, schema.type(ctx)),
      onRun: (ctx) => ctx.get(commandsCtx).call(command.key),
    });
    mark('superscript', 'body.superscript', superscript, toggleSuperscript);
    mark('subscript', 'body.subscript', subscript, toggleSubscript);
    if (takes('footnotes')) {
      group.addItem('footnote', {
        icon: ICONS.footnote,
        label: say('body.footnote'),
        active: () => false,
        onRun: (ctx) => {
          if (canMarkFootnote(ctx.get(editorViewCtx).state)) ctx.get(commandsCtx).call(insertFootnote.key);
        },
      });
    }
    if (takes('quote')) {
      group.addItem('citation', {
        icon: ICONS.citation,
        label: say('body.citation'),
        active: (ctx) => ctx.get(editorViewCtx).state.selection.$from.parent.type.name === 'konzilo_citation',
        onRun: (ctx) => ctx.get(commandsCtx).call(toggleCitation.key),
      });
    }
  },
});

// An editor on `root` holding `value`: { write(), view, destroy() }. `changed` is told of each
// change to the document, which may be no real edit: a trailing paragraph is one too. `images`:
// { choose(), chooseSeveral(), picture(address) } as the field gives them, or null where there
// is no library.
export async function makeEditor({ root, value, elements, changed, images = null }) {
  const taken = new Set(elements);
  const takes = (element) => taken.has(element);
  const policy = { takes, pasting: false };
  let ownPaste = false;
  const crepe = new CrepeBuilder({ root, defaultValue: value });
  const { editor } = crepe;

  const leftOut = [NEVER, ...Object.entries(PARTS).filter(([element]) => !takes(element)).map(([, parts]) => parts)].flat(2);
  await editor.remove(leftOut);

  editor.config((ctx) => {
    ctx.update(remarkStringifyOptionsCtx, writerOptions);
    ctx.set(remarkGFMPlugin.options.key, { tablePipeAlign: false });
    ctx.set(hardbreakFilterNodes.key, ['table', 'code_block', 'heading', 'konzilo_citation', 'konzilo_image', 'konzilo_gallery_caption']);
    if (takes('heading')) {
      ctx.update(headingKeymap.key, (keys) => ({
        ...keys,
        TurnIntoH1: { ...keys.TurnIntoH1, shortcuts: [] },
        DowngradeHeading: { ...keys.DowngradeHeading, shortcuts: [] },
      }));
    }
    ctx.update(editorViewOptionsCtx, (options) => ({
      ...options,
      attributes: { ...options.attributes, spellcheck: 'true' },
      transformPastedHTML: (html) => {
        ownPaste = html.includes('data-pm-slice');
        return html;
      },
      transformPasted: (slice, view) => (ownPaste || view.dragging ? slice : reducePasted(slice)),
      handlePaste: (view, event, given) => {
        // Plain text is read as Markdown, and what it holds of the unadmitted is reduced
        // here; pasted HTML has been through `transformPasted`.
        const { clipboardData } = event;
        if (!clipboardData || view.state.selection.$from.parent.type.spec.code) return false;
        // An address the site embeds, alone on an empty line, is what an editor pastes for one.
        const alone = clipboardData.getData('text/plain').trim();
        if (takes('embed') && atEmptyTopBlock(view.state) && isEmbeddable(alone)) {
          ctx.get(commandsCtx).call(insertEmbed.key, alone);
          return true;
        }
        const cell = inCell(view.state);
        const caption = inImageCaption(view.state);
        const put = (slice) => view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        const line = (slice) => (caption ? captionLine(slice, view.state) : oneLine(slice, view.state.schema));
        if (clipboardData.getData('text/html').length > 0 || clipboardData.getData('vscode-editor-data')) {
          if (!cell && !caption) return false;
          put(line(given));
          return true;
        }
        const text = clipboardData.getData('text/plain');
        if (text.length === 0) return false;
        policy.pasting = true;
        let doc;
        try {
          doc = ctx.get(parserCtx)(text);
        } finally {
          policy.pasting = false;
        }
        const reduced = reducedText(doc);
        put(cell || caption ? line(reduced) : reduced);
        return true;
      },
    }));
  });

  editor.use(bodyDocument(takes('image') || takes('embed'))).use(markOrder.flat()).use(keptBlock).use(superscript).use(subscript).use(toggleSuperscript).use(toggleSubscript);
  if (takes('embed')) editor.use(embedNode).use(insertEmbed).use(embedView);
  if (takes('image')) editor.use(imageNode).use(insertImage).use(imageStaysAnImage).use(imageView(images?.picture ?? null));
  if (takes('image') && takes('gallery')) editor.use(galleryCaption).use(galleryNode).use(insertGallery).use(galleriesHoldTwo).use(galleryView(images)).use(galleryCaptionView);
  if (takes('heading')) editor.use(headingWithAnchor).use(headingInputRule);
  if (takes('quote')) editor.use(citation).use(quoteWithCitation).use(toggleCitation);
  if (takes('footnotes')) editor.use(insertFootnote).use(footnotesInStep);
  editor.use(noLevelOne).use(fieldKeys).use(fieldMarks(takes('heading'))).use(onDocumentChange(changed));
  // Last among the transforms, so that it reads what Milkdown's own have made of the tree.
  editor.use($remark('konziloFormat', () => readFormat(policy)));

  crepe
    .addFeature(cursor, {})
    .addFeature(linkTooltip, { inputPlaceholder: say('body.linkPlaceholder') })
    .addFeature(placeholder, { text: say('body.placeholder'), mode: 'block' })
    .addFeature(toolbar, toolbarOptions(takes))
    .addFeature(blockEdit, menu(takes, images));
  if (takes('list')) crepe.addFeature(listItem, {});
  if (takes('table')) crepe.addFeature(tableFeature, {});
  // After the block feature, which sets its own: a gallery has one handle, and each image in it
  // moves in the gallery's own way.
  editor.config((ctx) => {
    ctx.update(blockConfig.key, ({ filterNodes }) => ({
      filterNodes: (pos, node) => filterNodes(pos, node) && !findParent(({ type }) => type.name === 'konzilo_gallery')(pos),
    }));
  });

  await crepe.create();
  return {
    write: () => editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc)).replace(/\n+$/, ''),
    view: editor.action((ctx) => ctx.get(editorViewCtx)),
    run: (command) => editor.action((ctx) => ctx.get(commandsCtx).call(command)),
    // The element of the block a click in the preview's page was on (place.js), or null where it
    // is no block of this editor's.
    blockElement(place) {
      const view = editor.action((ctx) => ctx.get(editorViewCtx));
      const found = blockAt(view.state.doc, place);
      const shown = found && view.nodeDOM(found.pos);
      return shown?.nodeType === Node.ELEMENT_NODE ? shown : null;
    },
    destroy: () => crepe.destroy(),
  };
}
