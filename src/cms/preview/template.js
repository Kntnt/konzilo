// The live preview in Sveltia's pane (ADR 0032): the page itself, from the preview's own
// origin, in a frame scaled from a desktop's width to the pane, and above it why the draft
// cannot be published, while the last good page stays, and over it, for a moment, where the page
// would have gone when it tried to leave. It is a React component, since that is what Sveltia
// takes, with its styles on the elements, since the pane is a document of Sveltia's own.

import { say } from '../interface-language.js';
import { signedInCredential } from '../credential.js';
import { postValues } from '../groups/values.js';
import { refusalShown } from '../refusals.js';
import { previewClient } from './client.js';
import { draftOf } from './draft.js';
import { PLACE_EVENT, PLACE_MESSAGE, SHOW_EVENT, SHOW_MESSAGE, STOPPED_MESSAGE } from './paths.js';
import { previewWindow } from '../preview-window/window.js';

// The narrowest the page is laid out at. A narrower pane shows it smaller; a wider one shows it
// at its own size, as wide as the pane, as a browser window that wide would: never larger.
const WIDTH = 1280;
// A page in the frame may run scripts and send forms, and do nothing to the editor around it.
export const SANDBOX = 'allow-same-origin allow-scripts allow-forms';

const BAR = { margin: 0, padding: '8px 12px', font: '14px/1.4 system-ui, sans-serif' };
const NOTE = { ...BAR, background: '#fff3cd', color: '#3d2f00' };
const QUIET = { ...BAR, background: '#f0f0f0', color: '#1c1c1c' };
// Over the page, so that nothing on it moves, and nothing on it is kept from a click.
const PASSING = { position: 'absolute', left: 12, bottom: 12, maxWidth: 'calc(100% - 24px)', boxSizing: 'border-box', margin: 0, padding: '8px 12px', borderRadius: 6, background: 'rgba(28, 28, 28, 0.92)', color: '#fff', font: '13px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere', pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)' };
const STOPPED_WORDS = { link: 'preview.stoppedLink', window: 'preview.stoppedWindow', form: 'preview.stoppedForm', script: 'preview.stoppedScript', history: 'preview.stoppedHistory' };

const freshId = () => globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12);

// What the pane says of a page kept from leaving: where it would have gone on the public site,
// and what a visitor would meet there.
export function stoppedWords({ to, how, where }) {
  const words = [say(STOPPED_WORDS[how], { to })];
  if (where?.loop) words.push(say('preview.thenLoops'));
  if (where?.redirect) words.push(say('preview.thenRedirects', where.redirect));
  if (where?.status >= 400 && where.status < 500) words.push(say('preview.thenMissing', { status: where.status }));
  return words.join(' ');
}

export function previewTemplate({ origin, several, credential = signedInCredential }) {
  return function KonziloPreview({ entry, document: paneDocument, window: paneWindow }) {
    const React = globalThis.__SVELTIA_CMS_REACT__;
    const { createElement: h } = React;
    const [state, setState] = React.useState({ phase: 'starting', address: null, refusals: [], leads: null, stopped: null });
    const [size, setSize] = React.useState({ width: WIDTH, height: 800 });
    const holder = React.useRef(null);
    const shown = React.useRef(null);
    const client = React.useRef(null);
    const unsavedId = React.useRef(null);
    // A window of its own, when the editor's menu says so and the window is open: the page is
    // drawn there, and this pane is hidden. The frame the page is in is then the window's.
    const [, windowChanged] = React.useReducer((turn) => turn + 1, 0);
    React.useEffect(() => previewWindow.watch(windowChanged), []);
    const away = previewWindow.wanted() && previewWindow.isOpen();
    const framed = () => previewWindow.frame() ?? shown.current;

    client.current ??= previewClient({ origin, credential, changed: setState });
    unsavedId.current ??= freshId();
    React.useEffect(() => () => client.current.close(), []);

    // Only the page in this frame, from where it is served, has anything to say here.
    React.useEffect(() => {
      const heard = ({ origin: from, source, data }) => {
        if (from !== origin || source !== framed()?.contentWindow) return;
        if (data?.type === STOPPED_MESSAGE) client.current.stopped(data);
        // A click on a block of the body, for the field that holds it to frame it: `block`, its
        // place among the body's blocks, and `path`, its place within them.
        if (data?.type === PLACE_MESSAGE && Number.isInteger(data.block) && data.block >= 0 && typeof data.text === 'string') {
          const path = typeof data.path === 'string' && /^\d+(?:\.\d+)*$/.test(data.path) ? data.path : String(data.block);
          globalThis.dispatchEvent(new CustomEvent(PLACE_EVENT, { detail: { block: data.block, path, text: data.text.slice(0, 200) } }));
        }
      };
      paneWindow.addEventListener('message', heard);
      const unheard = previewWindow.heard(heard);
      // A block a field shows, for the page to show it too.
      const show = ({ detail }) => framed()?.contentWindow?.postMessage({ type: SHOW_MESSAGE, path: detail.path, text: detail.text ?? '' }, origin);
      globalThis.addEventListener(SHOW_EVENT, show);
      return () => {
        paneWindow.removeEventListener('message', heard);
        unheard();
        globalThis.removeEventListener(SHOW_EVENT, show);
      };
    }, []);

    // Flat, as the source file holds it, with the field groups' fields as they are now.
    const plainData = postValues(entry.get('data'));
    const written = JSON.stringify(plainData);
    const collection = entry.get('collection');
    const id = entry.get('slug') || unsavedId.current;
    const tag = several ? paneDocument.documentElement.lang || null : null;
    React.useEffect(() => {
      client.current.update(() => draftOf({ collection, id, tag, data: plainData }));
    }, [written, collection, id, tag]);

    React.useEffect(() => {
      paneDocument.body.style.margin = '0';
      const watched = holder.current;
      const measure = () => setSize({ width: watched.clientWidth, height: watched.clientHeight });
      measure();
      const observer = new paneWindow.ResizeObserver(measure);
      observer.observe(watched);
      return () => observer.disconnect();
    }, []);

    const scale = size.width > 0 ? Math.min(1, size.width / WIDTH) : 1;
    // What the preview says above the page, and over it for a moment, as data, so that the pane
    // and the window can each draw it.
    const notes = [];
    if (state.phase === 'off') notes.push({ key: 'off', role: 'alert', look: NOTE, text: say('preview.off') });
    if (state.refusals.length > 0) notes.push({ key: 'refused', role: 'alert', look: NOTE, text: say(state.address === null ? 'preview.refusedNoPage' : 'preview.refused'), items: state.refusals.map((refusal) => ({ key: `${refusal.field?.name ?? refusal.field}:${refusal.name ?? refusal.reason}`, text: refusalShown(refusal) })) });
    if (state.leads !== null) notes.push({ key: 'leads', role: 'status', look: QUIET, text: state.leads.loop ? say('preview.leadsRound', state.leads) : say('preview.leads', state.leads) });
    if (state.phase === 'starting') notes.push({ key: 'starting', role: 'status', look: QUIET, text: say('preview.starting') });
    if (state.phase === 'shown' && state.address === null && state.refusals.length === 0 && state.leads === null) notes.push({ key: 'none', role: 'status', look: QUIET, text: say('preview.noPage') });
    const passing = state.stopped ? { text: stoppedWords(state.stopped), look: PASSING } : null;

    React.useEffect(() => {
      if (away) previewWindow.show({ origin, address: state.address, notes, passing, sandbox: SANDBOX, frameTitle: say('preview.title'), title: say('preview.windowTitle', { title: plainData?.title ?? '' }) });
    });
    React.useEffect(() => {
      globalThis.document.documentElement.classList.toggle('konzilo-preview-away', away);
    }, [away]);
    React.useEffect(() => () => {
      globalThis.document.documentElement.classList.remove('konzilo-preview-away');
      previewWindow.idle();
    }, []);

    // White behind the page, so that a page being drawn again never shows the editor's colours.
    const frame = away || state.address === null ? null : h('iframe', {
      ref: shown,
      title: say('preview.title'),
      src: `${origin}${state.address}`,
      sandbox: SANDBOX,
      style: { display: 'block', border: 0, width: Math.max(WIDTH, size.width), height: size.height / scale, transform: `scale(${scale})`, transformOrigin: '0 0', background: '#fff' },
    });
    const noteIn = ({ key, role, look, text, items }) => (items
      ? h('div', { key, role, style: look }, text, h('ul', { style: { margin: '4px 0 0', paddingInlineStart: 20 } }, items.map((item) => h('li', { key: item.key }, item.text))))
      : h('p', { key, role, style: look }, text));
    // Chosen, but not open: the window has been closed, or the browser would not open it.
    const closed = previewWindow.wanted() && !away && h('p', { role: 'status', style: QUIET }, say('preview.windowClosed'), ' ', h('button', { type: 'button', onClick: () => previewWindow.open() }, say('preview.windowOpen')));

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100vh' } },
      closed,
      away ? null : notes.map(noteIn),
      h('div', { ref: holder, style: { position: 'relative', flex: '1 1 auto', overflow: 'hidden', minHeight: 0, background: '#fff' } }, frame, !away && passing && h('p', { role: 'status', style: PASSING }, passing.text)));
  };
}

// A preview for each type with pages. Other collections keep Sveltia's own pane.
export function registerPreview(CMS, config, { origin, collections }) {
  const template = previewTemplate({ origin, several: Boolean(config.i18n) });
  for (const name of collections) CMS.registerPreviewTemplate(name, template);
}
