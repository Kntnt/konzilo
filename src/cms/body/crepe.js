// The editor itself: `CrepeBuilder` with the parts ADR 0030 names, and a type's elements
// deciding its schema, toolbar and block menu. Left out for every type: the image block,
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
import { $remark } from '@milkdown/kit/utils';

import { readFormat, writerOptions } from './format.js';
import {
  canMarkFootnote,
  citation,
  fieldKeys,
  fieldMarks,
  footnotesInStep,
  headingInputRule,
  headingWithAnchor,
  insertFootnote,
  markOrder,
  noLevelOne,
  onDocumentChange,
  quoteWithCitation,
  keptBlock,
  subscript,
  superscript,
  toggleCitation,
  toggleSubscript,
  toggleSuperscript,
} from './nodes.js';
import { inCell, oneLine, reducedText, reducePasted } from './paste.js';
import { say } from './texts.js';

const ICON = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">${body}</svg>`;
const ICONS = {
  superscript: ICON('<path d="M5 6h2.5l3.5 5.2L14.5 6H17l-4.7 7L17 20h-2.5l-3.5-5.2L7.5 20H5l4.7-7z"/><path d="M21 8h-4V7l2.3-2.1c.5-.5.7-.8.7-1.1 0-.4-.3-.7-.8-.7-.5 0-.9.3-1.3.8l-.8-.8C17.7 2.4 18.5 2 19.3 2 20.5 2 21.3 2.7 21.3 3.8c0 .7-.3 1.2-1 1.8L18.9 6.9H21z"/>'),
  subscript: ICON('<path d="M5 4h2.5l3.5 5.2L14.5 4H17l-4.7 7L17 18h-2.5L11 12.8 7.5 18H5l4.7-7z"/><path d="M21 22h-4v-1l2.3-2.1c.5-.5.7-.8.7-1.1 0-.4-.3-.7-.8-.7-.5 0-.9.3-1.3.8l-.8-.8c.6-.7 1.4-1.1 2.2-1.1 1.2 0 2 .7 2 1.8 0 .7-.3 1.2-1 1.8L18.9 20.9H21z"/>'),
  footnote: ICON('<path d="M4 18h9v-2H4zm0-5h13v-2H4zm0-7v2h16V6z"/><path d="M19 12h2v8h-2z"/>'),
  citation: ICON('<path d="M4 6h16v2H4zm0 5h10v2H4zm9 5h7v2h-7z"/>'),
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
const NEVER = [hrAttr, hrSchema, insertHrCommand, insertHrInputRule, imageAttr, imageSchema, insertImageCommand, updateImageCommand, wrapInTaskListInputRule, uploadPlugin, remarkPreserveEmptyLinePlugin, syncHeadingIdPlugin, wrapInHeadingInputRule];

const menu = (takes) => {
  const headings = takes('heading') ? {} : null;
  const item = (key) => ({ label: say(key) });
  return {
    textGroup: {
      label: say('textGroup'),
      text: item('text'),
      h1: null,
      h2: headings && item('heading2'),
      h3: headings && item('heading3'),
      h4: headings && item('heading4'),
      h5: headings && item('heading5'),
      h6: headings && item('heading6'),
      quote: takes('quote') ? item('quote') : null,
      divider: null,
    },
    listGroup: takes('list') ? { label: say('listGroup'), bulletList: item('bulletList'), orderedList: item('orderedList'), taskList: null } : null,
    advancedGroup: takes('code') || takes('table')
      ? { label: say('moreGroup'), image: null, math: null, codeBlock: takes('code') ? item('code') : null, table: takes('table') ? item('table') : null }
      : null,
    buildMenu(builder) {
      if (!takes('quote')) return;
      builder.getGroup('text').addItem('citation', {
        label: say('citation'),
        icon: ICONS.citation,
        onRun: (ctx) => {
          const commands = ctx.get(commandsCtx);
          commands.call(clearTextInCurrentBlockCommand.key);
          commands.call(toggleCitation.key);
        },
      });
    },
  };
};

const toolbarOptions = (takes) => ({
  boldLabel: say('bold'),
  italicLabel: say('italic'),
  strikethroughLabel: say('strikethrough'),
  codeLabel: say('inlineCode'),
  linkLabel: say('link'),
  buildToolbar(builder) {
    const group = builder.getGroup('formatting');
    const mark = (key, schema, command) => group.addItem(key, {
      icon: ICONS[key],
      label: say(key),
      active: (ctx) => ctx.get(commandsCtx).call(isMarkSelectedCommand.key, schema.type(ctx)),
      onRun: (ctx) => ctx.get(commandsCtx).call(command.key),
    });
    mark('superscript', superscript, toggleSuperscript);
    mark('subscript', subscript, toggleSubscript);
    if (takes('footnotes')) {
      group.addItem('footnote', {
        icon: ICONS.footnote,
        label: say('footnote'),
        active: () => false,
        onRun: (ctx) => {
          if (canMarkFootnote(ctx.get(editorViewCtx).state)) ctx.get(commandsCtx).call(insertFootnote.key);
        },
      });
    }
    if (takes('quote')) {
      group.addItem('citation', {
        icon: ICONS.citation,
        label: say('citation'),
        active: (ctx) => ctx.get(editorViewCtx).state.selection.$from.parent.type.name === 'konzilo_citation',
        onRun: (ctx) => ctx.get(commandsCtx).call(toggleCitation.key),
      });
    }
  },
});

// An editor on `root` holding `value`: { write(), view, destroy() }. `changed` is told of each
// change to the document, which may be no real edit: a trailing paragraph is one too.
export async function makeEditor({ root, value, elements, changed }) {
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
    ctx.set(hardbreakFilterNodes.key, ['table', 'code_block', 'heading', 'konzilo_citation']);
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
        const cell = inCell(view.state);
        const put = (slice) => view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        if (clipboardData.getData('text/html').length > 0 || clipboardData.getData('vscode-editor-data')) {
          if (!cell) return false;
          put(oneLine(given, view.state.schema));
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
        put(cell ? oneLine(reduced, view.state.schema) : reduced);
        return true;
      },
    }));
  });

  editor.use(markOrder.flat()).use(keptBlock).use(superscript).use(subscript).use(toggleSuperscript).use(toggleSubscript);
  if (takes('heading')) editor.use(headingWithAnchor).use(headingInputRule);
  if (takes('quote')) editor.use(citation).use(quoteWithCitation).use(toggleCitation);
  if (takes('footnotes')) editor.use(insertFootnote).use(footnotesInStep);
  editor.use(noLevelOne).use(fieldKeys).use(fieldMarks(takes('heading'))).use(onDocumentChange(changed));
  // Last among the transforms, so that it reads what Milkdown's own have made of the tree.
  editor.use($remark('konziloFormat', () => readFormat(policy)));

  crepe
    .addFeature(cursor, {})
    .addFeature(linkTooltip, { inputPlaceholder: say('linkPlaceholder') })
    .addFeature(placeholder, { text: say('placeholder'), mode: 'block' })
    .addFeature(toolbar, toolbarOptions(takes))
    .addFeature(blockEdit, menu(takes));
  if (takes('list')) crepe.addFeature(listItem, {});
  if (takes('table')) crepe.addFeature(tableFeature, {});

  await crepe.create();
  return {
    write: () => editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc)).replace(/\n+$/, ''),
    view: editor.action((ctx) => ctx.get(editorViewCtx)),
    run: (command) => editor.action((ctx) => ctx.get(commandsCtx).call(command)),
    destroy: () => crepe.destroy(),
  };
}
