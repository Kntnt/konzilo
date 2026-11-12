// The live preview's toolbar (ADR 0032): a small bar the gate puts on every page it shows in a
// tab of its own, which says what the page is built from, a post with its status or a term, or
// that it is not edited in one place, and, for someone who may write, leads to its form on the
// admin host, in the same tab. It starts in the bottom right corner, moves wherever it is dragged,
// by a mouse or a finger, or by the arrow keys, and pushed against the left or right edge it
// tucks away into a small tab there, which brings it back. Its place is kept in the browser's
// storage, where there is any. It is the gate's, in no build of the site: never in the pane, which
// is a frame, never on the public site and never in a share link's build.

import { interfaceLanguageTag, text } from '../catalogues.js';

// A post's status as the toolbar says it, by its text's name.
const STATUSES = Object.freeze({
  published: 'previewTab.toolbar.published',
  draft: 'previewTab.toolbar.draft',
  scheduled: 'previewTab.toolbar.scheduled',
});

// A scheduled post's moment, in UTC, named, as its form holds it: the site keeps every moment in
// UTC and declares no time zone of its own.
const MOMENT = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' };

// A source file's entry in the editor on the admin host: its collection, the file's first
// folder, and its ID, the file's name, in whichever language's folder it is.
const entryOf = (adminOrigin, file) => {
  const parts = file.split('/');
  return `${adminOrigin}/#/collections/${encodeURIComponent(parts[0])}/entries/${encodeURIComponent(parts.at(-1).replace(/\.[^.]+$/, ''))}`;
};

// What the toolbar shows on a page, all of it in the interface language `language`: `about`, what
// the page is built from, as the preview's runner gives it, or null; `writes`, whether its person
// may write to the source, and so edit; `adminOrigin`, where the editor is.
export function toolbarOf({ about, writes, language, adminOrigin }) {
  let says;
  let link;
  let tone = 'other';
  if (about?.kind === 'post') {
    tone = Object.hasOwn(STATUSES, about.status) ? about.status : 'draft';
    const moment = tone === 'scheduled' ? new Date(about.at).toLocaleString(interfaceLanguageTag(language), MOMENT) : '';
    says = text(language, STATUSES[tone], { moment });
    link = { href: entryOf(adminOrigin, about.file), text: text(language, 'previewTab.toolbar.editPost') };
  } else if (about?.kind === 'term') {
    says = text(language, 'previewTab.toolbar.term', { name: about.title });
    link = { href: entryOf(adminOrigin, about.file), text: text(language, 'previewTab.toolbar.editTerm') };
  } else {
    says = text(language, 'previewTab.toolbar.many');
    link = { href: `${adminOrigin}/`, text: text(language, 'previewTab.toolbar.editor') };
  }
  return {
    language: interfaceLanguageTag(language),
    label: text(language, 'previewTab.toolbar.label'),
    says,
    tone,
    link: writes ? link : null,
    move: text(language, 'previewTab.toolbar.move'),
    hint: text(language, 'previewTab.toolbar.hint'),
    show: text(language, 'previewTab.toolbar.show'),
  };
}

// The script that draws the toolbar `given`, as toolbarOf() gives it, which holds all it needs,
// and nothing in it can end the element it stands in.
export const toolbarScript = (given) => `(${previewToolbar})(${JSON.stringify(given).replaceAll('<', '\\u003c')});`;

// A page of the site with the toolbar `given` in it, last in its body.
export function withToolbar(html, given) {
  const script = `<script>${toolbarScript(given)}</script>`;
  const at = html.toLowerCase().lastIndexOf('</body');
  return at === -1 ? `${html}${script}` : `${html.slice(0, at)}${script}${html.slice(at)}`;
}

// The toolbar itself, run in the page, in a shadow tree of its own, which the site's styles do not
// reach. It does nothing in a frame, which is the pane's.
export function previewToolbar(given) {
  if (window.parent !== window || !document.body || document.querySelector('konzilo-preview-toolbar')) return;

  // Where its place is kept, how far from the window's edges it starts, how far an arrow key moves
  // it, four times as far with Shift, how far past an edge it is pushed to tuck away, and how far a
  // press moves before it is a drag, in CSS pixels.
  const KEPT = 'konzilo-preview-toolbar';
  const EDGE = 16;
  const STEP = 16;
  const PAST = 32;
  const STARTS = 4;

  const host = document.createElement('konzilo-preview-toolbar');
  const root = host.attachShadow({ mode: 'open' });
  const make = (name, attributes = {}, ...children) => {
    const element = document.createElement(name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    element.append(...children);
    return element;
  };
  const style = make('style');
  style.textContent = `
:host { all: initial; }
[hidden] { display: none !important; }
.frame { position: fixed; z-index: 2147483647; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #f8fafc; }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; box-sizing: border-box; max-width: calc(100vw - 16px); padding: 4px 14px 4px 4px; background: #1e293b; border-radius: 8px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.35); touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
.bar.dragged { cursor: grabbing; }
.bar.tucking { opacity: 0.6; }
button { margin: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: inherit; }
.grip { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 6px; }
.says { display: flex; align-items: center; gap: 6px; }
.says::before { content: ""; flex: none; width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; }
.says[data-tone="published"]::before { background: #4ade80; }
.says[data-tone="draft"]::before { background: #fbbf24; }
.says[data-tone="scheduled"]::before { background: #60a5fa; }
a { color: #bfdbfe; text-decoration: underline; white-space: nowrap; cursor: pointer; }
.tab { display: grid; place-items: center; width: 24px; height: 48px; background: #1e293b; box-shadow: 0 4px 16px rgb(0 0 0 / 0.35); cursor: pointer; }
.tab[data-edge="left"] { border-radius: 0 8px 8px 0; }
.tab[data-edge="right"] { border-radius: 8px 0 0 8px; }
.tab[data-edge="right"] svg { transform: scaleX(-1); }
:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
@media (forced-colors: active) { .bar, .tab { border: 1px solid CanvasText; } }
@media print { .frame { display: none; } }
`;
  const icon = (markup) => {
    const holder = make('span', { 'aria-hidden': 'true' });
    holder.innerHTML = markup;
    return holder.firstChild;
  };
  const hint = make('span', { id: 'hint', hidden: '' }, given.hint);
  const grip = make('button', { type: 'button', class: 'grip', 'aria-label': given.move, 'aria-describedby': 'hint' },
    icon('<svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/></svg>'));
  const says = make('span', { class: 'says', 'data-tone': given.tone }, given.says);
  const bar = make('div', { class: 'bar' }, grip, says);
  if (given.link) {
    const link = make('a', { href: given.link.href, draggable: 'false' }, given.link.text);
    bar.append(link);
  }
  const tab = make('button', { type: 'button', class: 'tab', 'aria-label': given.show, hidden: '' },
    icon('<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg>'));
  const frame = make('div', { class: 'frame', role: 'region', 'aria-label': given.label, lang: given.language }, bar, tab, hint);
  root.append(style, frame);
  document.body.append(host);

  // Where it stands, as it is kept: one of `left` and `right` and one of `top` and `bottom`, each
  // its distance from that edge of the window, the nearer, so that it stays by its corner as the
  // window changes; and `tucked`, the edge it is tucked into, or null.
  const STARTING = { right: EDGE, bottom: EDGE, tucked: null };
  const distance = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const valid = (kept) => kept !== null && typeof kept === 'object' && distance(kept.top) !== distance(kept.bottom)
    && (['left', 'right'].includes(kept.tucked) || ((kept.tucked ?? null) === null && distance(kept.left) !== distance(kept.right)));
  let place = STARTING;
  try {
    const kept = JSON.parse(localStorage.getItem(KEPT));
    if (valid(kept)) place = kept;
  } catch {
    // No storage, or nothing usable in it: it starts where it starts.
  }
  const keep = () => {
    try {
      localStorage.setItem(KEPT, JSON.stringify(place));
    } catch {
      // It stays where it is on this page.
    }
  };

  const windowSize = () => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight });
  const within = (value, most) => Math.max(0, Math.min(value, Math.max(0, most)));
  const shown = () => (place.tucked ? tab : bar);

  // The window's edges by `place`, each distance kept to what leaves the bar or the tab in view.
  const draw = () => {
    bar.hidden = Boolean(place.tucked);
    tab.hidden = !place.tucked;
    if (place.tucked) tab.dataset.edge = place.tucked;
    const { width, height } = windowSize();
    const size = shown().getBoundingClientRect();
    const across = place.tucked ? { [place.tucked]: 0 } : distance(place.left) ? { left: within(place.left, width - size.width) } : { right: within(place.right, width - size.width) };
    const along = distance(place.top) ? { top: within(place.top, height - size.height) } : { bottom: within(place.bottom, height - size.height) };
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const value = across[side] ?? along[side];
      frame.style[side] = value === undefined ? '' : `${value}px`;
    }
  };

  // The bar's top left corner, where it stands now.
  const corner = () => {
    const { left, top } = bar.getBoundingClientRect();
    return { x: left, y: top };
  };

  // The bar at a corner, kept from its nearer edges.
  const settleAt = ({ x, y }) => {
    const { width, height } = windowSize();
    const size = bar.getBoundingClientRect();
    const left = within(x, width - size.width);
    const top = within(y, height - size.height);
    place = {
      ...(left + size.width / 2 <= width / 2 ? { left } : { right: Math.max(0, width - size.width - left) }),
      ...(top + size.height / 2 <= height / 2 ? { top } : { bottom: Math.max(0, height - size.height - top) }),
      tucked: null,
    };
    draw();
    keep();
  };

  // Tucked into an edge, the tab where the bar stood; and back from it, a little way from that
  // edge. The focus goes along with what it was on.
  const holdsFocus = () => root.activeElement !== null && root.activeElement !== undefined;
  const tuck = (edge) => {
    const focused = holdsFocus();
    const { y } = corner();
    const { height } = windowSize();
    const size = bar.getBoundingClientRect();
    place = { ...(y + size.height / 2 <= height / 2 ? { top: y } : { bottom: Math.max(0, height - size.height - y) }), tucked: edge };
    draw();
    keep();
    if (focused) tab.focus();
  };
  const bringBack = () => {
    const focused = holdsFocus();
    const edge = place.tucked;
    const { top } = tab.getBoundingClientRect();
    place = { left: 0, top, tucked: null };
    draw();
    const { width } = windowSize();
    const size = bar.getBoundingClientRect();
    settleAt({ x: edge === 'left' ? EDGE : width - size.width - EDGE, y: top });
    if (focused) grip.focus();
  };
  tab.addEventListener('click', bringBack);

  // Whether a bar whose left side would be at `x` is pushed past an edge, and which.
  const pushedPast = (x) => {
    const { width } = windowSize();
    const size = bar.getBoundingClientRect();
    return x < -PAST ? 'left' : x + size.width > width + PAST ? 'right' : null;
  };

  // A drag, by a mouse, a finger or a pen, which starts once a press has moved a little, so that a
  // click or a tap on the link still follows it.
  let press = null;
  let dragged = false;
  bar.addEventListener('dragstart', (event) => event.preventDefault());
  bar.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    dragged = false;
    press = { id: event.pointerId, from: { x: event.clientX, y: event.clientY }, at: corner(), dragging: false, wanted: null };
  });
  bar.addEventListener('pointermove', (event) => {
    if (press === null || event.pointerId !== press.id) return;
    const dx = event.clientX - press.from.x;
    const dy = event.clientY - press.from.y;
    if (!press.dragging) {
      if (Math.hypot(dx, dy) < STARTS) return;
      press.dragging = true;
      bar.setPointerCapture?.(event.pointerId);
      bar.classList.add('dragged');
    }
    event.preventDefault();
    press.wanted = { x: press.at.x + dx, y: press.at.y + dy };
    const { width, height } = windowSize();
    const size = bar.getBoundingClientRect();
    frame.style.left = `${within(press.wanted.x, width - size.width)}px`;
    frame.style.top = `${within(press.wanted.y, height - size.height)}px`;
    frame.style.right = '';
    frame.style.bottom = '';
    bar.classList.toggle('tucking', pushedPast(press.wanted.x) !== null);
  });
  const release = (event) => {
    if (press === null || event.pointerId !== press.id) return;
    const ended = press;
    press = null;
    bar.classList.remove('dragged', 'tucking');
    if (!ended.dragging) return;
    dragged = true;
    const edge = event.type === 'pointerup' ? pushedPast(ended.wanted.x) : null;
    if (edge) tuck(edge);
    else settleAt(corner());
  };
  bar.addEventListener('pointerup', release);
  bar.addEventListener('pointercancel', release);
  // The click that ends a drag follows nothing.
  bar.addEventListener('click', (event) => {
    if (!dragged) return;
    dragged = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  // The arrow keys on its handle move it; against the left or right edge, a step further tucks it.
  grip.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? STEP * 4 : STEP;
    const by = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!by || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const { x, y } = corner();
    const { width } = windowSize();
    const size = bar.getBoundingClientRect();
    if (by[0] < 0 && x <= 0) return tuck('left');
    if (by[0] > 0 && x + size.width >= width) return tuck('right');
    return settleAt({ x: x + by[0], y: y + by[1] });
  });

  draw();
  window.addEventListener('resize', draw);
}
