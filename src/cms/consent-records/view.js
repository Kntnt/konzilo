// The *Consent records* page (ADR 0049): the record of each choice visitors make in the site's
// consent, which an Admin alone sees: the choices per day of a span, the last 30 days at first,
// by the control each was made with, and those counted and not stored; a span's records as CSV by
// the separator the Admin chooses; and a consent ID's records, each with what its revision showed
// the visitor. Every day and moment is in UTC, as the records are kept. It is React, since that
// is what Sveltia takes, with its styles on the elements, and it writes nothing.

import { signedInCredential } from '../credential.js';
import { say } from '../interface-language.js';
import { momentIn } from '../../submission-values.js';
import { Download } from '../submissions/view.js';
import { consentIdOf, downloadRecords, findRecords, lastDays, readDays } from './client.js';

const TEXT = { font: '14px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere' };
const LINE = { ...TEXT, margin: '4px 0 12px', maxWidth: '60em' };
const HEADING = { ...TEXT, fontSize: 16, fontWeight: 600, margin: '24px 0 8px' };
const ROW = { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', margin: '0 0 16px' };
const FIELD = { ...TEXT, display: 'grid', gap: 4 };
const CELL = { ...TEXT, padding: '4px 12px 4px 0', textAlign: 'start', verticalAlign: 'top' };
const NUMBER = { ...CELL, textAlign: 'end', fontVariantNumeric: 'tabular-nums' };
const RECORD = { borderTop: '1px solid rgba(128, 128, 128, 0.3)', padding: '12px 0' };
const FACTS = { display: 'grid', gridTemplateColumns: 'minmax(8em, max-content) 1fr', gap: '4px 16px', margin: 0, ...TEXT };
const LABEL = { fontWeight: 600 };
const VALUE = { margin: 0, whiteSpace: 'pre-wrap' };
const PROBLEM = { ...TEXT, color: '#b3261e' };

// The controls, in the order the table's columns take them.
const CONTROLS = ['accept', 'reject', 'save', 'allow', 'withdraw'];
// The most days a span takes, as the service does.
const SPAN_AT_MOST = 400;
const DAY = 24 * 60 * 60_000;

const react = () => globalThis.__SVELTIA_CMS_REACT__;

const inUtc = momentIn('UTC');
const momentShown = (at) => `${inUtc(at)} UTC`;

// Whether `from` and `to`, `YYYY-MM-DD`, are a span the service takes.
const isSpan = ({ from, to }) => /^\d{4}-\d\d-\d\d$/.test(from) && /^\d{4}-\d\d-\d\d$/.test(to) && from <= to && (Date.parse(to) - Date.parse(from)) / DAY + 1 <= SPAN_AT_MOST;

function Facts({ rows }) {
  const { createElement: h } = react();
  return h('dl', { style: FACTS }, rows.filter(Boolean).flatMap(([label, value], at) => [
    h('dt', { key: `${at}-label`, style: LABEL }, label),
    h('dd', { key: `${at}-value`, style: VALUE }, value),
  ]));
}

// What a record's revision showed the visitor, in the visitor's language: the banner, the privacy
// settings with each category and its services, the embeds' panels and the right to object where
// there were any, and the pages linked.
function Shown({ shown }) {
  const { createElement: h } = react();
  if (!shown) return h('p', { style: LINE }, say('consentRecords.shownUnknown'));
  const part = (title, ...children) => h('section', { style: { margin: '8px 0 12px' } }, h('h4', { style: { ...TEXT, fontWeight: 600, margin: '0 0 4px' } }, title), ...children);
  const said = (text) => h('p', { style: { ...LINE, margin: '2px 0 6px' } }, text);
  return h('div', null,
    part(say('consentRecords.banner'), said(shown.banner.title), said(shown.banner.text), said([shown.banner.accept, shown.banner.reject, shown.banner.customise].join(' · '))),
    part(say('consentRecords.dialog'),
      said(shown.dialog.title),
      said(shown.dialog.introduction),
      shown.categories.map((category) => h('div', { key: category.id, style: { margin: '8px 0' } },
        h('p', { style: { ...LINE, margin: '2px 0', fontWeight: 600 } }, category.name),
        said(category.description),
        h('ul', { style: { ...TEXT, margin: '0 0 8px', paddingInlineStart: 20 } }, category.services.map((service) => h('li', { key: service.id },
          h('span', { style: LABEL }, service.name), ` (${service.id})`,
          h(Facts, { rows: [
            [say('consentRecords.purpose'), service.purpose],
            service.necessity ? [say('consentRecords.necessity'), service.necessity] : null,
            [say('consentRecords.provider'), service.provider ?? say('consentRecords.siteOwn')],
          ] })))))),
      said([shown.dialog.accept, shown.dialog.reject, shown.dialog.save].join(' · '))),
    shown.placeholders.length > 0 ? part(say('consentRecords.placeholders'), shown.placeholders.map((placeholder) => h('div', { key: placeholder.service }, said(placeholder.question), said(placeholder.storage), said(placeholder.button)))) : null,
    shown.objection ? part(say('consentRecords.objection'), said(shown.objection)) : null,
    shown.policies.length > 0 ? part(say('consentRecords.policies'), said(shown.policies.map(({ title, href }) => `${title} (${href})`).join(', '))) : null);
}

// A record: when, where and how the choice was made, what it allowed, and what the visitor saw.
function Record({ record }) {
  const { createElement: h } = react();
  const names = new Map((record.shown?.categories ?? []).flatMap((category) => [[`category:${category.id}`, category.name], ...category.services.map((service) => [`service:${service.id}`, service.name])]));
  const yesOrNo = (state) => say(state ? 'consentRecords.yes' : 'consentRecords.no');
  const services = (allowed) => Object.keys(record.services).filter((service) => record.services[service] === allowed).map((service) => names.get(`service:${service}`) ?? service).join(', ') || '–';
  return h('li', { style: RECORD },
    h('p', { style: { ...TEXT, fontWeight: 600, margin: '0 0 6px' } }, `${momentShown(record.chosen)}: ${say(`consentRecords.control.${record.control}`)}`),
    h(Facts, { rows: [
      [say('consentRecords.how'), say(`consentRecords.how.${record.how}`)],
      [say('consentRecords.path'), record.path],
      [say('consentRecords.language'), record.language],
      [say('consentRecords.revision'), record.revision],
      ...Object.entries(record.categories).map(([category, state]) => [names.get(`category:${category}`) ?? category, yesOrNo(state)]),
      [say('consentRecords.allowed'), services(true)],
      [say('consentRecords.refused'), services(false)],
    ] }),
    h('details', { style: { margin: '8px 0 0' } },
      h('summary', { style: TEXT }, say('consentRecords.shown')),
      h(Shown, { shown: record.shown })));
}

// The choices per day of a span, newest first, and the span's records as CSV.
function Days({ credential, answer, span, onSpan }) {
  const { createElement: h, useState } = react();
  const [draft, setDraft] = useState(span);
  const [wrong, setWrong] = useState(false);
  const field = (name, label) => h('div', { style: FIELD },
    h('label', { htmlFor: `konzilo-consent-records-${name}` }, label),
    h('input', { id: `konzilo-consent-records-${name}`, type: 'date', value: draft[name], onChange: (event) => setDraft({ ...draft, [name]: event.target.value }) }));
  return h('section', { 'aria-labelledby': 'konzilo-consent-records-days' },
    h('h2', { id: 'konzilo-consent-records-days', style: HEADING }, say('consentRecords.days')),
    h('form', {
      style: ROW,
      onSubmit: (event) => {
        event.preventDefault();
        const ok = isSpan(draft);
        setWrong(!ok);
        if (ok) onSpan(draft);
      },
    }, field('from', say('consentRecords.from')), field('to', say('consentRecords.to')), h('button', { type: 'submit' }, say('consentRecords.show'))),
    wrong ? h('p', { role: 'alert', style: PROBLEM }, say('consentRecords.badSpan')) : null,
    answer === null ? h('p', { role: 'alert', style: LINE }, say('consentRecords.unknown')) : null,
    answer?.days ? h('div', { style: { overflowX: 'auto' } }, h('table', { style: { borderCollapse: 'collapse', margin: '0 0 8px' } },
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', style: CELL }, say('consentRecords.day')),
        CONTROLS.map((control) => h('th', { key: control, scope: 'col', style: NUMBER }, say(`consentRecords.control.${control}`))),
        h('th', { scope: 'col', style: NUMBER }, say('consentRecords.notStored')))),
      h('tbody', null, [...answer.days].reverse().map((day) => h('tr', { key: day.day },
        h('th', { scope: 'row', style: { ...CELL, fontWeight: 400 } }, day.day),
        CONTROLS.map((control) => h('td', { key: control, style: NUMBER }, String(day[control]))),
        h('td', { style: NUMBER }, String(day.notStored))))))) : null,
    h('p', { style: LINE }, say('consentRecords.notStoredHelp')),
    h(Download, { key: `${span.from}-${span.to}`, download: (separator) => downloadRecords({ credential, from: span.from, to: span.to, separator }) }));
}

// A consent ID's records, found by the ID a visitor gives.
function Find({ credential }) {
  const { createElement: h, useState } = react();
  const [text, setText] = useState('');
  const [wrong, setWrong] = useState(false);
  const [answer, setAnswer] = useState(undefined);
  const [finding, setFinding] = useState(false);
  return h('section', { 'aria-labelledby': 'konzilo-consent-records-find' },
    h('h2', { id: 'konzilo-consent-records-find', style: HEADING }, say('consentRecords.findHeading')),
    h('p', { style: LINE }, say('consentRecords.findHelp')),
    h('form', {
      role: 'search',
      style: ROW,
      onSubmit: async (event) => {
        event.preventDefault();
        const id = consentIdOf(text);
        setWrong(id === null);
        if (id === null) return;
        setFinding(true);
        const given = await findRecords({ credential, id });
        setFinding(false);
        setAnswer(given);
      },
    },
    h('div', { style: FIELD },
      h('label', { htmlFor: 'konzilo-consent-records-id' }, say('consentRecords.id')),
      h('input', { id: 'konzilo-consent-records-id', type: 'search', value: text, maxLength: 64, spellCheck: false, onChange: (event) => setText(event.target.value), style: { minWidth: '24em', fontFamily: 'ui-monospace, monospace' } })),
    h('button', { type: 'submit', disabled: finding }, say('consentRecords.find'))),
    wrong ? h('p', { role: 'alert', style: PROBLEM }, say('consentRecords.notAnId')) : null,
    answer === null ? h('p', { role: 'alert', style: LINE }, say('consentRecords.unknown')) : null,
    answer?.records ? h('div', null,
      h('p', { role: 'status', style: LINE }, answer.records.length === 0 ? say('consentRecords.none') : say('consentRecords.found', { count: answer.records.length })),
      h('ol', { style: { listStyle: 'none', margin: 0, padding: 0 } }, answer.records.map((record) => h(Record, { key: `${record.chosen}-${record.control}`, record })))) : null);
}

export function consentRecordsPage({ credential = signedInCredential, today = () => new Date() } = {}) {
  return function KonziloConsentRecordsPage() {
    const { createElement: h, useEffect, useState } = react();
    const [span, setSpan] = useState(() => lastDays(30, today));
    // What the service answered of the span: undefined until it is told, else as readDays() gives it.
    const [answer, setAnswer] = useState(undefined);
    const [asked, setAsked] = useState(false);
    useEffect(() => {
      let gone = false;
      readDays({ credential, ...span }).then((given) => {
        if (gone) return;
        setAnswer(given);
        setAsked(true);
      });
      return () => {
        gone = true;
      };
    }, [span.from, span.to]);
    const page = (...children) => h('div', { style: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box' } }, ...children);
    if (!asked) return null;
    if (answer?.adminOnly) return page(h('p', { style: LINE }, say('consentRecords.adminOnly')));
    return page(
      h('p', { style: LINE }, say('consentRecords.intro')),
      h(Days, { credential, answer, span, onSpan: setSpan }),
      h(Find, { credential }));
  };
}
