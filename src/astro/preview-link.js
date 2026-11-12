// What leads from the live preview's page to the body field and back: a click on a block of the
// body tells the pane which block, by its place among the body's blocks and its path within them,
// and what its text is, so that the field can frame it, and see for itself that it is the block
// meant, as the page may be a moment behind what is typed. The focus stays on the page. A block
// shows what a click reaches. What a visitor would use, a link, a button or a form's field, does
// as it does on the site. The other way, the pane asks the page to show a block a field shows:
// the page scrolls to it and marks it, opens the `<details>` it stands in, and tells the design,
// by the event `konzilo-preview-show` on the block, so that a design's own tab or panel can open
// too. The page says it is there, once it listens, since the pane asks nothing of a frame that has
// not said so. It is written into the page as it stands, so it holds all it needs, and it is on the
// live preview's pages alone.

// `kind`: what the pane knows a click by; `showKind`: what the page knows a block to show by;
// `readyKind`: what the pane knows the page to be there by.
export function previewLink(kind, showKind, readyKind) {
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
    // Only the editor's own click: the page's own, opening a tab to show a block, says nothing.
    if (!event.isTrusted) return;
    const block = blockAt(event.target);
    if (!block || event.button !== 0 || !window.getSelection().isCollapsed) return;
    const text = solid(textsOf(block).map(({ data }) => data).join('')).slice(0, LONGEST);
    const path = block.dataset.konziloBlock;
    window.parent.postMessage({ type: kind, block: Number(path.split('.')[0]), path, text }, '*');
  });

  // The block a field shows: the one at its path, or, where a level has no element of its own,
  // the first below it; where that lacks the text the field sends, the nearest at the same depth
  // that has it, since the page may be a moment behind.
  const lettersOf = (words) => String(words ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const found = (path, text) => {
    const at = document.querySelector(`[data-konzilo-block="${path}"]`) ?? document.querySelector(`[data-konzilo-block^="${path}."]`);
    const probe = lettersOf(text).slice(0, 40);
    if (probe === '' || (at && lettersOf(at.textContent).includes(probe))) return at;
    const steps = path.split('.').map(Number);
    const away = (other) => other.split('.').map(Number).reduce((sum, step, index) => sum + Math.abs(step - (steps[index] ?? 0)), 0);
    const holding = [...document.querySelectorAll(BLOCK)]
      .filter((other) => other.dataset.konziloBlock.split('.').length === steps.length && lettersOf(other.textContent).includes(probe))
      .sort((one, two) => away(one.dataset.konziloBlock) - away(two.dataset.konziloBlock));
    return holding[0] ?? at;
  };
  let marked = null;
  // The editor: the window around the pane, the pane itself, or, for a window of its own, the
  // editor that opened it.
  const fromEditor = (source) => {
    try {
      return [window.parent, window.top, window.parent.opener, window.top.opener].includes(source);
    } catch {
      return source === window.parent || source === window.top;
    }
  };
  window.addEventListener('message', ({ source, data }) => {
    if (!fromEditor(source) || data?.type !== showKind || typeof data.path !== 'string' || !/^\d+(?:\.\d+)*$/.test(data.path)) return;
    const block = found(data.path, data.text);
    if (marked) marked.style.boxShadow = '';
    marked = block;
    if (!block) return;
    for (let at = block.parentElement; at; at = at.parentElement) if (at.tagName === 'DETAILS' && !at.open) at.open = true;
    block.dispatchEvent(new CustomEvent('konzilo-preview-show', { bubbles: true }));
    block.style.boxShadow = '0 0 0 3px #2563eb';
    block.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  window.parent.postMessage({ type: readyKind }, '*');
}
