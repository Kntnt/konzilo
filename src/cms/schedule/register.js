// A scheduled post's triggers in Sveltia (ADR 0076): the core's own field in the status group,
// shown while the post is scheduled, and the checks at Save of what a scheduled post waits for.
//
// While a post waits for a moment alone, the date above holds it, as it always has, and the field
// offers two buttons, to add a trigger beside it on its row, as an alternative, or on a row of its
// own. Once there are others, the field holds every trigger, the moment among them, the date is out
// of sight (groups/menu.js), and each row is a group of its triggers, each with its kind, what it
// waits for and a button to remove it, and a button to add another on the row; a post-published
// trigger's conditions are rows the same way. Every control is the browser's own, labelled, so
// that the keyboard and a screen reader reach each one.
//
// The field's settings in the configuration (config.js):
//   types: [{ name, label }]           the site's types, which a condition may name
//   taxonomies: [{ label, folder }]    the site's taxonomies, whose terms a condition may name, each
//                                      by its folder of terms in the source repository
//   termFields: [...]                  the post's fields that name its terms
//   type: <name>                       the post's own type

import { signedInCredential } from '../credential.js';
import { postValues } from '../groups/values.js';
import { say } from '../interface-language.js';
import { useReadOnly } from '../lock/read-only.js';
import { plain } from '../plain.js';
import { readStatus } from '../publishing/status.js';
import { refuseAtSave } from '../refusals.js';
import { sourceOf } from '../source.js';
import { authorsIn } from '../authors/terms.js';
import { addCondition, addTrigger, changeCondition, changeTrigger, cycleThrough, problemAtSave, removeCondition, removeTrigger, rowsIn, stampedAtSave, writtenFrom } from './model.js';
import { kindOf } from '../../format/triggers.js';
import { TRIGGERS_WIDGET } from './widget.js';
import './triggers.css';

// The moment now, to the second, as a trigger holds one.
const nowMoment = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

// Sveltia's Save, the one button with a key of its own, Mod-S, which presses it.
const SAVE = 'button[aria-keyshortcuts$="+S"]';

// A moment as the browser's own field of a date and time shows it, in UTC, and back.
const shownMoment = (moment) => (typeof moment === 'string' && moment.length >= 16 ? moment.slice(0, 16) : '');
const takenMoment = (shown) => (shown ? `${shown}:00Z` : '');

// Why a save is stopped, by what the check at Save names (model.js).
const PROBLEMS = Object.freeze({ momentAhead: 'schedule.momentAhead', windowPassed: 'schedule.windowPassed', incomplete: 'schedule.incomplete' });

const KINDS = [['moment', 'schedule.kindMoment'], ['published', 'schedule.kindPublished']];
const CONDITIONS = [['type', 'schedule.kindType'], ['words', 'schedule.kindWords'], ['term', 'schedule.kindTerm'], ['window', 'schedule.kindWindow']];

export function registerSchedule(CMS, config) {
  const React = globalThis.__SVELTIA_CMS_REACT__;
  const h = React.createElement;
  const { api, repository, branch } = sourceOf(config);
  // Each taxonomy's terms, read once while the page is open (authors/terms.js reads any folder of
  // terms).
  const termsRead = new Map();
  const termsOf = (folder) => {
    if (!api) return Promise.resolve([]);
    if (!termsRead.has(folder)) termsRead.set(folder, authorsIn({ api, repository, branch, folder, credential: signedInCredential }).list().catch(() => []));
    return termsRead.get(folder);
  };

  function Choice({ id, label, value, options, onChange, disabled }) {
    return h('span', { className: 'konzilo-schedule-choice' },
      h('label', { htmlFor: id }, label),
      h('select', { id, className: 'konzilo-part-input konzilo-part-select', value, disabled, onChange: (event) => onChange(event.target.value) },
        options.map(([one, words]) => h('option', { key: one, value: one }, words))));
  }

  // Words typed: the field keeps what is typed, and the value reaches it only while it is not being
  // typed in, since a controlled field would be set back to the last value at each key, before the
  // group's value comes round, and lose what is typed meanwhile.
  function Typed({ id, label, value, onChange, disabled }) {
    const input = React.useRef(null);
    React.useEffect(() => {
      const shown = input.current;
      if (shown && shown !== document.activeElement && shown.value !== (value ?? '')) shown.value = value ?? '';
    }, [value]);
    return h('span', { className: 'konzilo-schedule-choice' },
      h('label', { htmlFor: id }, label),
      h('input', { ref: input, id, type: 'text', className: 'konzilo-part-input', defaultValue: value ?? '', disabled, onChange: (event) => onChange(event.target.value) }));
  }

  function Moment({ id, label, value, onChange, disabled }) {
    return h('span', { className: 'konzilo-schedule-choice' },
      h('label', { htmlFor: id }, label),
      h('input', { id, type: 'datetime-local', className: 'konzilo-part-input', value: shownMoment(value), disabled, onChange: (event) => onChange(takenMoment(event.target.value)) }));
  }

  // One condition of a post-published trigger: its kind, what it asks for, and its removal.
  function Condition({ id, condition, change, remove, types, terms, disabled }) {
    const kind = kindOf(condition);
    const made = {
      type: () => ({ type: types[0]?.name ?? '' }),
      words: () => ({ words: '' }),
      term: () => ({ term: terms[0]?.id ?? '' }),
      window: () => ({ from: '', to: '' }),
    };
    let asked;
    if (kind === 'type') asked = h(Choice, { id: `${id}-type`, label: say('schedule.type'), value: condition.type, options: types.map(({ name, label }) => [name, label]), onChange: (type) => change({ type }), disabled });
    else if (kind === 'words') asked = h(Typed, { id: `${id}-words`, label: say('schedule.words'), value: condition.words, onChange: (words) => change({ words }), disabled });
    else if (kind === 'term') {
      const known = terms.some((one) => one.id === condition.term);
      asked = h('span', { className: 'konzilo-schedule-choice' },
        h('label', { htmlFor: `${id}-term` }, say('schedule.term')),
        h('select', { id: `${id}-term`, className: 'konzilo-part-input konzilo-part-select', value: condition.term, disabled, onChange: (event) => change({ term: event.target.value }) },
          // None chosen yet, or one no longer among the terms read, shown as it is.
          condition.term ? null : h('option', { value: '' }, ''),
          known || !condition.term ? null : h('option', { value: condition.term }, condition.term),
          terms.map((one) => h('option', { key: one.id, value: one.id }, one.label))));
    } else {
      // Either end may be left out, and a window with neither is one still to fill in.
      const window = (end, value) => {
        const next = Object.fromEntries(Object.entries({ from: condition.from, to: condition.to, [end]: value }).filter(([, one]) => one));
        change(Object.keys(next).length > 0 ? next : { from: '', to: '' });
      };
      asked = h('span', { className: 'konzilo-schedule-window' },
        h(Moment, { id: `${id}-from`, label: say('schedule.from'), value: condition.from, onChange: (value) => window('from', value), disabled }),
        h(Moment, { id: `${id}-to`, label: say('schedule.to'), value: condition.to, onChange: (value) => window('to', value), disabled }));
    }
    return h('div', { className: 'konzilo-schedule-condition' },
      h(Choice, { id: `${id}-kind`, label: say('schedule.condition'), value: kind, options: CONDITIONS.map(([one, words]) => [one, say(words)]), onChange: (next) => change(made[next]()), disabled }),
      asked,
      disabled ? null : h('button', { type: 'button', className: 'konzilo-part-button', onClick: remove }, say('schedule.removeCondition')));
  }

  // A post-published trigger's conditions, in their rows.
  function Conditions({ id, trigger, change, types, terms, disabled }) {
    const fresh = () => ({ type: types[0]?.name ?? '' });
    return h('div', { className: 'konzilo-schedule-conditions' },
      h('p', { className: 'konzilo-schedule-note', id: `${id}-about` }, say('schedule.conditions')),
      trigger.published.map((row, r) => h(React.Fragment, { key: r },
        r > 0 ? h('p', { className: 'konzilo-schedule-joint' }, say('schedule.and')) : null,
        h('div', { role: 'group', className: 'konzilo-schedule-row', 'aria-label': say('schedule.conditionRow', { n: r + 1 }) },
          row.map((condition, c) => h(React.Fragment, { key: c },
            c > 0 ? h('p', { className: 'konzilo-schedule-joint' }, say('schedule.or')) : null,
            h(Condition, {
              id: `${id}-${r}-${c}`,
              condition,
              types,
              terms,
              disabled,
              change: (next) => change(changeCondition(trigger, r, c, next)),
              remove: () => change(removeCondition(trigger, r, c)),
            }))),
          disabled ? null : h('button', { type: 'button', className: 'konzilo-part-add', onClick: () => change(addCondition(trigger, r, fresh())) }, say('schedule.addCondition'))))),
      disabled ? null : h('button', { type: 'button', className: 'konzilo-part-add', onClick: () => change(addCondition(trigger, null, fresh())) }, say('schedule.addConditionRow')));
  }

  CMS.registerFieldType(TRIGGERS_WIDGET, function KonziloTriggers({ value, onChange, field, forID, group }) {
    const types = plain(field.get('types')) ?? [];
    const taxonomies = plain(field.get('taxonomies')) ?? [];
    const readOnly = useReadOnly(React);
    const [terms, setTerms] = React.useState([]);
    const values = group?.values ?? { status: 'scheduled', date: '', triggers: plain(value) };
    const rows = rowsIn({ date: values.date, triggers: plain(values.triggers) });
    const wantsTerms = rows.flat().some((trigger) => trigger.published?.flat().some((condition) => kindOf(condition) === 'term'));
    React.useEffect(() => {
      if (!wantsTerms || terms.length > 0) return undefined;
      let gone = false;
      void Promise.all(taxonomies.map(({ label, folder }) => termsOf(folder).then((list) => list.map(({ id, name }) => ({ id, label: say('schedule.termOption', { term: name, taxonomy: label }) }))))).then((lists) => {
        if (!gone) setTerms(lists.flat());
      });
      return () => {
        gone = true;
      };
    }, [wantsTerms]);
    const write = (next) => {
      const made = writtenFrom(next);
      if (group) group.change(made);
      else onChange(made.triggers);
    };
    // A trigger new or changed counts from the save that writes it: Save, pressed or by its key,
    // is heard first, before Sveltia reads the form, and gives each its moment (stampedAtSave()).
    const latest = React.useRef(null);
    latest.current = { rows, write };
    React.useEffect(() => {
      const saving = (event) => {
        if (!event.target?.closest?.(SAVE)) return;
        const { rows: held, write: writing } = latest.current;
        const stamped = stampedAtSave(held, nowMoment());
        if (stamped !== held) writing(stamped);
      };
      globalThis.addEventListener('click', saving, { capture: true });
      return () => globalThis.removeEventListener('click', saving, { capture: true });
    }, []);
    const fresh = () => ({ published: [[{ type: types[0]?.name ?? '' }]] });
    const adding = (row) => h('button', { type: 'button', className: 'konzilo-part-add', onClick: () => write(addTrigger(rows, row, fresh())) }, say(row === null ? 'schedule.addRow' : 'schedule.addAlternative'));
    const heldInDate = !(Array.isArray(plain(values.triggers)) && plain(values.triggers).length > 0);
    // A moment alone, or none yet: the date holds it, and two buttons add others.
    if (heldInDate) return readOnly ? null : h('div', { className: 'konzilo-schedule konzilo-schedule-adding' }, adding(0), adding(null));
    return h('div', { className: 'konzilo-schedule', 'aria-describedby': `${forID}-about` },
      h('p', { className: 'konzilo-schedule-note', id: `${forID}-about` }, say('schedule.about')),
      rows.map((row, r) => h(React.Fragment, { key: r },
        r > 0 ? h('p', { className: 'konzilo-schedule-joint' }, say('schedule.and')) : null,
        h('fieldset', { className: 'konzilo-schedule-row' },
          h('legend', null, say('schedule.row', { n: r + 1 })),
          row.map((trigger, t) => {
            const id = `${forID}-${r}-${t}`;
            const kind = kindOf(trigger);
            const change = (next) => write(changeTrigger(rows, r, t, next));
            return h(React.Fragment, { key: t },
              t > 0 ? h('p', { className: 'konzilo-schedule-joint' }, say('schedule.or')) : null,
              h('div', { role: 'group', className: 'konzilo-schedule-trigger', 'aria-label': say('schedule.trigger', { n: t + 1, row: r + 1 }) },
                h('div', { className: 'konzilo-schedule-line' },
                  h(Choice, { id: `${id}-kind`, label: say('schedule.kind'), value: kind, options: KINDS.map(([one, words]) => [one, say(words)]), disabled: readOnly, onChange: (next) => change(next === 'moment' ? { moment: '' } : fresh()) }),
                  kind === 'moment' ? h(Moment, { id: `${id}-moment`, label: say('schedule.moment'), value: trigger.moment, disabled: readOnly, onChange: (moment) => change({ moment }) }) : null,
                  readOnly ? null : h('button', { type: 'button', className: 'konzilo-part-button', onClick: () => write(removeTrigger(rows, r, t)) }, say('schedule.removeTrigger'))),
                kind === 'published' ? h(Conditions, { id, trigger, change, types, terms, disabled: readOnly }) : null));
          }),
          readOnly ? null : adding(r)))),
      readOnly ? null : h('div', { className: 'konzilo-schedule-adding' }, adding(null)));
  });

  // At Save, a scheduled post waits for something still to come: each moment among its triggers
  // ahead, a window not wholly passed, nothing left empty, and no cycle of posts that wait for each
  // other, as the last build read the others, the terms above the post's own counted among its
  // terms. A moment alone keeps the words it always had.
  const collections = Object.fromEntries((config.collections ?? []).filter((one) => one.fields).map((one) => [one.name, one]));
  const triggersField = (made) => made?.fields?.flatMap((one) => one.fields ?? [one]).find((one) => one.widget === TRIGGERS_WIDGET) ?? null;
  CMS.registerEventListener({
    name: 'preSave',
    handler: async ({ entry }) => {
      const data = postValues(entry.get('data'));
      if (data.status !== 'scheduled') return;
      const rows = rowsIn({ date: data.date, triggers: data.triggers });
      const alone = rows.length === 0 || (rows.length === 1 && rows[0].length === 1 && kindOf(rows[0][0]) === 'moment');
      const problem = problemAtSave(rows, nowMoment());
      if (problem) refuseAtSave(say(alone && problem === 'momentAhead' ? 'parts.scheduledAhead' : PROBLEMS[problem]));
      if (!rows.flat().some((trigger) => trigger.published)) return;
      const collection = collections[entry.get('collection')];
      const own = triggersField(collection);
      const status = await readStatus({ credential: signedInCredential });
      if (!status || !own) return;
      // The post's own saved versions, in any language, are the form's.
      const id = entry.get('slug');
      const isOwn = (file) => Boolean(id) && file.startsWith(`${collection.folder}/`) && file.endsWith(`/${id}.md`);
      const terms = (own.termFields ?? []).flatMap((name) => (Array.isArray(data[name]) ? data[name] : data[name] ? [data[name]] : [])).map(String);
      const others = status.posts.filter((one) => one.status === 'scheduled' && one.triggers && !isOwn(one.file));
      // Each term's parent, so that the terms above the post's own count, as the intake counts them.
      const listed = await Promise.all((own.taxonomies ?? []).map(({ folder }) => termsOf(folder)));
      const parents = new Map(listed.flat().filter((one) => one.parent).map((one) => [one.id, one.parent]));
      const through = cycleThrough({ file: null, type: own.type, title: data.title ?? '', terms, rows }, others, parents);
      if (through) refuseAtSave(say('schedule.cycle', { post: through }));
    },
  });
}
