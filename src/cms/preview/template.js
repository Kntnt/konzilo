// The live preview in Sveltia's pane (ADR 0032): the page itself, from the preview's own
// origin, in a frame scaled from a desktop's width to the pane, and above it why the draft
// cannot be published, while the last good page stays, and over it, for a moment, where the page
// would have gone when it tried to leave. It is a React component, since that is what Sveltia
// takes, with its styles on the elements, since the pane is a document of Sveltia's own.

import { say } from '../body/texts.js';
import { signedInCredential } from '../credential.js';
import { previewClient } from './client.js';
import { draftOf } from './draft.js';
import { PLACE_EVENT, PLACE_MESSAGE, STOPPED_MESSAGE } from './paths.js';

const WIDTH = 1280;
// A page in the frame may run scripts and send forms, and do nothing to the editor around it.
export const SANDBOX = 'allow-same-origin allow-scripts allow-forms';

const BAR = { margin: 0, padding: '8px 12px', font: '14px/1.4 system-ui, sans-serif' };
const NOTE = { ...BAR, background: '#fff3cd', color: '#3d2f00' };
const QUIET = { ...BAR, background: '#f0f0f0', color: '#1c1c1c' };
// Over the page, so that nothing on it moves, and nothing on it is kept from a click.
const PASSING = { position: 'absolute', left: 12, bottom: 12, maxWidth: 'calc(100% - 24px)', boxSizing: 'border-box', margin: 0, padding: '8px 12px', borderRadius: 6, background: 'rgba(28, 28, 28, 0.92)', color: '#fff', font: '13px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere', pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)' };
const STOPPED_WORDS = { link: 'previewStoppedLink', window: 'previewStoppedWindow', form: 'previewStoppedForm', script: 'previewStoppedScript', history: 'previewStoppedHistory' };

const freshId = () => globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12);

// What the pane says of a page kept from leaving: where it would have gone on the public site,
// and what a visitor would meet there.
export function stoppedWords({ to, how, where }) {
  const words = [say(STOPPED_WORDS[how], { to })];
  if (where?.loop) words.push(say('previewThenLoops'));
  if (where?.redirect) words.push(say('previewThenRedirects', where.redirect));
  if (where?.status >= 400 && where.status < 500) words.push(say('previewThenMissing', { status: where.status }));
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

    client.current ??= previewClient({ origin, credential, changed: setState });
    unsavedId.current ??= freshId();
    React.useEffect(() => () => client.current.close(), []);

    // Only the page in this frame, from where it is served, has anything to say here.
    React.useEffect(() => {
      const heard = ({ origin: from, source, data }) => {
        if (from !== origin || source !== shown.current?.contentWindow) return;
        if (data?.type === STOPPED_MESSAGE) client.current.stopped(data);
        // A click on a block of the body, for the body field to put the cursor there.
        if (data?.type === PLACE_MESSAGE && Number.isInteger(data.block) && data.block >= 0 && Number.isInteger(data.count) && data.count >= 0 && typeof data.text === 'string') {
          globalThis.dispatchEvent(new CustomEvent(PLACE_EVENT, { detail: { block: data.block, count: data.count, text: data.text.slice(0, 200) } }));
        }
      };
      paneWindow.addEventListener('message', heard);
      return () => paneWindow.removeEventListener('message', heard);
    }, []);

    const data = entry.get('data');
    const plainData = data?.toJS ? data.toJS() : data;
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

    const scale = size.width > 0 ? size.width / WIDTH : 1;
    const frame = state.address === null ? null : h('iframe', {
      ref: shown,
      title: say('previewTitle'),
      src: `${origin}${state.address}`,
      sandbox: SANDBOX,
      style: { display: 'block', border: 0, width: WIDTH, height: size.height / scale, transform: `scale(${scale})`, transformOrigin: '0 0' },
    });
    const notes = [];
    if (state.phase === 'off') notes.push(h('p', { key: 'off', role: 'alert', style: NOTE }, say('previewOff')));
    if (state.refusals.length > 0) {
      notes.push(h('div', { key: 'refused', role: 'alert', style: NOTE }, say(frame === null ? 'previewRefusedNoPage' : 'previewRefused'), h('ul', { style: { margin: '4px 0 0', paddingInlineStart: 20 } }, state.refusals.map(({ field, reason }) => h('li', { key: `${field}:${reason}` }, field ? `${field}: ${reason}` : reason)))));
    }
    if (state.leads !== null) notes.push(h('p', { key: 'leads', role: 'status', style: QUIET }, state.leads.loop ? say('previewLeadsRound', state.leads) : say('previewLeads', state.leads)));
    if (state.phase === 'starting') notes.push(h('p', { key: 'starting', role: 'status', style: QUIET }, say('previewStarting')));
    if (state.phase === 'shown' && state.address === null && state.refusals.length === 0 && state.leads === null) notes.push(h('p', { key: 'none', role: 'status', style: QUIET }, say('previewNoPage')));

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100vh' } },
      notes,
      h('div', { ref: holder, style: { position: 'relative', flex: '1 1 auto', overflow: 'hidden', minHeight: 0 } }, frame, state.stopped && h('p', { role: 'status', style: PASSING }, stoppedWords(state.stopped))));
  };
}

// A preview for each type with pages. Other collections keep Sveltia's own pane.
export function registerPreview(CMS, config, { origin, collections }) {
  const template = previewTemplate({ origin, several: Boolean(config.i18n) });
  for (const name of collections) CMS.registerPreviewTemplate(name, template);
}
