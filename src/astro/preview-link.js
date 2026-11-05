// What leads from the live preview's page to the body field: a click on a block of the body tells
// the pane which block, how far into its text, and what its text is, so that the field can put
// the cursor there, and see for itself that it is the block meant, as the page may be a moment
// behind what is typed. A block shows what a click reaches. What a visitor would use, a link, a
// button or a form's field, does as it does on the site. It is written into the page as it stands,
// so it holds all it needs, and it is on the live preview's pages alone.

// `kind`: what the pane knows these messages by.
export function previewLink(kind) {
  if (window.parent === window) return;

  const BLOCK = '[data-konzilo-block]';
  const ITS_OWN = 'a[href], button, summary, input, select, textarea, label, iframe, dialog';
  // What a page shows that is no text a person wrote: a footnote's marks, words for screen
  // readers, and an embed's panel.
  const NOT_WRITTEN = '[data-footnote-ref], [data-footnote-backref], .sr-only, .konzilo-embed, dialog';
  const LONGEST = 200;

  const textsOf = (block) => {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (text) => (text.parentElement?.closest(NOT_WRITTEN) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const texts = [];
    for (let text = walker.nextNode(); text; text = walker.nextNode()) texts.push(text);
    return texts;
  };
  const solid = (words) => words.replace(/\s+/g, '');
  const caretAt = (x, y) => {
    if (document.caretPositionFromPoint) {
      const point = document.caretPositionFromPoint(x, y);
      return point && { node: point.offsetNode, offset: point.offset };
    }
    const range = document.caretRangeFromPoint?.(x, y);
    return range && { node: range.startContainer, offset: range.startOffset };
  };
  // How many characters of the block's text, spaces aside, come before the caret.
  const countBefore = (texts, caret) => {
    if (!caret) return 0;
    const range = document.createRange();
    range.setStart(caret.node, caret.offset);
    let count = 0;
    for (const text of texts) {
      if (text === caret.node) return count + solid(text.data.slice(0, caret.offset)).length;
      if (range.comparePoint(text, text.length) > 0) return count;
      count += solid(text.data).length;
    }
    return count;
  };

  let lit = null;
  const light = (block) => {
    if (block === lit) return;
    if (lit) {
      lit.style.outline = '';
      lit.style.outlineOffset = '';
      lit.style.cursor = '';
    }
    lit = block;
    if (!lit) return;
    lit.style.outline = '1px dashed currentcolor';
    lit.style.outlineOffset = '4px';
    lit.style.cursor = 'pointer';
  };
  const blockAt = (target) => (target?.closest?.(ITS_OWN) ? null : target?.closest?.(BLOCK) ?? null);

  document.addEventListener('mouseover', ({ target }) => light(blockAt(target)));
  document.addEventListener('mouseleave', () => light(null));
  document.addEventListener('click', (event) => {
    const block = blockAt(event.target);
    if (!block || event.button !== 0 || !window.getSelection().isCollapsed) return;
    const texts = textsOf(block);
    const text = solid(texts.map(({ data }) => data).join('')).slice(0, LONGEST);
    const count = countBefore(texts, caretAt(event.clientX, event.clientY));
    window.parent.postMessage({ type: kind, block: Number(block.dataset.konziloBlock), count, text }, '*');
  });
}
