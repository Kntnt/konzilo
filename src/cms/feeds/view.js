// The *Feeds* page (ADR 0079): the feeds of other sites the site reads, which an Admin alone sees,
// adds, changes and removes, kept in the service and none in Git: each feed's address, the type its
// items become, the language of its posts on a site in several, and the minutes between its reads,
// with when it was last read and why the last read failed, where it did. Removing a feed asks
// first, and says that its posts stay published as posts like any other. It is React, since that
// is what Sveltia takes, with its styles on the elements.

import { labelIn } from '../../catalogues.js';
import { signedInCredential } from '../credential.js';
import { interfaceLanguage, say } from '../interface-language.js';
import { momentShown } from '../submissions/client.js';
import { addFeed, changeFeed, failureShown, feedProblemsShown, readFeeds, removeFeed } from './client.js';

const TEXT = { font: '14px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere' };
const LINE = { ...TEXT, margin: '4px 0 12px', maxWidth: '60em' };
const SET = { border: '1px solid rgba(128, 128, 128, 0.3)', borderRadius: 6, margin: '0 0 16px', padding: 12, display: 'grid', gap: 10, maxWidth: '40em' };
const LEGEND = { ...TEXT, fontWeight: 600, padding: '0 4px' };
const FIELD = { ...TEXT, display: 'grid', gap: 4 };
const PROBLEM = { ...TEXT, margin: 0, color: '#b3261e' };
const WAYS = { display: 'flex', gap: 8, flexWrap: 'wrap' };

const react = () => globalThis.__SVELTIA_CMS_REACT__;

// A language's name in the interface language, by its tag.
const languageName = (tag) => {
  try {
    return new Intl.DisplayNames([interfaceLanguage()], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
};

// A field with its label, and its problem beside it, of an input or a select, `control`.
function Field({ id, label, problem, control, ...rest }) {
  const { createElement: h } = react();
  return h('div', { style: FIELD },
    h('label', { htmlFor: id }, label),
    h(control, { id, 'aria-invalid': problem ? 'true' : undefined, 'aria-describedby': problem ? `${id}-problem` : undefined, ...rest }),
    problem ? h('p', { id: `${id}-problem`, style: PROBLEM }, problem) : null);
}

// The choices of a feed: its type, among those a feed may become, its language on a site in
// several, and its minutes between reads.
function Choices({ prefix, draft, shown, problems, onChange }) {
  const { createElement: h } = react();
  const set = (name) => (event) => onChange({ ...draft, [name]: event.target.value });
  return [
    h(Field, {
      key: 'type',
      id: `${prefix}-type`,
      label: say('feeds.type'),
      problem: problems.type,
      control: 'select',
      value: draft.type,
      onChange: set('type'),
    }, h('option', { value: '' }, say('feeds.chooseType')), shown.types.filter(({ choosable, name }) => choosable || name === draft.type).map(({ name, label }) => h('option', { key: name, value: name }, String(labelIn(label, interfaceLanguage()))))),
    shown.languages ? h(Field, {
      key: 'language',
      id: `${prefix}-language`,
      label: say('feeds.language'),
      problem: problems.language,
      control: 'select',
      value: draft.language,
      onChange: set('language'),
    }, h('option', { value: '' }, say('feeds.chooseLanguage')), shown.languages.map((tag) => h('option', { key: tag, value: tag }, languageName(tag)))) : null,
    h(Field, { key: 'every', id: `${prefix}-every`, label: say('feeds.every'), problem: problems.every, control: 'input', value: draft.every, onChange: set('every'), inputMode: 'numeric', autoComplete: 'off', style: { maxWidth: '8em' } }),
  ];
}

// A feed the site reads: its address, its choices, when it was last read and why that failed,
// and the ways to save its choices and to remove it.
function Feed({ feed, shown, onShown }) {
  const { createElement: h, useState } = react();
  const [draft, setDraft] = useState({ type: feed.type, language: feed.language ?? '', every: String(feed.every) });
  const [problems, setProblems] = useState({});
  const [said, setSaid] = useState(null);
  const prefix = `konzilo-feed-${feed.id}`;
  const save = async (event) => {
    event.preventDefault();
    setSaid('feeds.saving');
    const result = await changeFeed({ credential: signedInCredential, id: feed.id, given: draft });
    if (result?.feeds) {
      setProblems({});
      setSaid('feeds.saved');
      onShown(result);
    } else if (result?.problems) {
      setProblems(feedProblemsShown(result.problems));
      setSaid('feeds.notSaved');
    } else {
      setSaid('feeds.saveFailed');
    }
  };
  const remove = async () => {
    if (!globalThis.confirm(say('feeds.removeConfirm', { address: feed.address }))) return;
    setSaid('feeds.saving');
    const result = await removeFeed({ credential: signedInCredential, id: feed.id });
    if (result?.feeds) onShown(result, 'feeds.removed');
    else setSaid('feeds.removeFailed');
  };
  return h('form', { onSubmit: save, noValidate: true },
    h('fieldset', { style: SET, 'data-feed': feed.address },
      h('legend', { style: LEGEND }, feed.address),
      h('p', { style: { ...TEXT, margin: 0 } }, feed.readAt ? say('feeds.read', { at: momentShown(feed.readAt) }) : say('feeds.notRead')),
      feed.failure ? h('p', { role: 'alert', style: PROBLEM }, say('feeds.lastFailure', { at: momentShown(feed.failure.at), reason: failureShown(feed.failure) })) : null,
      ...Choices({ prefix, draft, shown, problems, onChange: setDraft }),
      h('div', { style: WAYS },
        h('button', { type: 'submit', disabled: said === 'feeds.saving' }, say('feeds.save')),
        h('button', { type: 'button', disabled: said === 'feeds.saving', onClick: remove }, say('feeds.remove'))),
      said ? h('p', { role: ['feeds.saving', 'feeds.saved'].includes(said) ? 'status' : 'alert', style: { ...TEXT, margin: 0 } }, say(said)) : null));
}

// A feed to add: its address and its choices.
function NewFeed({ shown, onShown }) {
  const { createElement: h, useState } = react();
  const empty = { address: '', type: '', language: '', every: '5' };
  const [draft, setDraft] = useState(empty);
  const [problems, setProblems] = useState({});
  const [said, setSaid] = useState(null);
  const add = async (event) => {
    event.preventDefault();
    setSaid('feeds.saving');
    const result = await addFeed({ credential: signedInCredential, given: draft });
    if (result?.feeds) {
      setDraft(empty);
      setProblems({});
      onShown(result, 'feeds.added');
      setSaid(null);
    } else if (result?.problems) {
      setProblems(feedProblemsShown(result.problems));
      setSaid('feeds.notSaved');
    } else {
      setSaid('feeds.saveFailed');
    }
  };
  return h('form', { onSubmit: add, noValidate: true },
    h('fieldset', { style: SET },
      h('legend', { style: LEGEND }, say('feeds.adding')),
      h('p', { style: { ...TEXT, margin: 0 } }, say('feeds.addHelp')),
      h(Field, { id: 'konzilo-feed-new-address', label: say('feeds.address'), problem: problems.address, control: 'input', type: 'url', value: draft.address, onChange: (event) => setDraft({ ...draft, address: event.target.value }), autoComplete: 'off' }),
      ...Choices({ prefix: 'konzilo-feed-new', draft, shown, problems, onChange: setDraft }),
      h('div', { style: WAYS }, h('button', { type: 'submit', disabled: said === 'feeds.saving' }, say('feeds.add'))),
      said ? h('p', { role: said === 'feeds.saving' ? 'status' : 'alert', style: { ...TEXT, margin: 0 } }, say(said)) : null));
}

export function feedsPage({ credential = signedInCredential } = {}) {
  return function KonziloFeedsPage() {
    const { createElement: h, useEffect, useState } = react();
    const [answer, setAnswer] = useState(undefined);
    const [told, setTold] = useState(null);
    useEffect(() => {
      let gone = false;
      readFeeds({ credential }).then((given) => {
        if (!gone) setAnswer(given);
      });
      return () => {
        gone = true;
      };
    }, []);
    const page = (...children) => h('div', { style: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box' } }, ...children);
    if (answer === undefined) return null;
    if (answer === null) return page(h('p', { style: LINE }, say('feeds.unknown')));
    if (answer.adminOnly) return page(h('p', { style: LINE }, say('feeds.adminOnly')));
    const shown = answer.feeds;
    const onShown = (result, words = null) => {
      setAnswer(result);
      setTold(words);
    };
    return page(
      h('p', { style: LINE }, say('feeds.intro')),
      told ? h('p', { role: 'status', style: LINE }, say(told)) : null,
      shown.feeds.length === 0 ? h('p', { style: LINE }, say('feeds.none')) : null,
      shown.feeds.map((feed) => h(Feed, { key: `${feed.id}:${feed.type}:${feed.language}:${feed.every}`, feed, shown, onShown })),
      h(NewFeed, { shown, onShown }));
  };
}
