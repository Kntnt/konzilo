// The *Addresses not found* page (ADR 0040): the addresses visitors asked for in the last 30 days
// and found nothing at, most asked first, each with how often and when it was last asked for, and
// three ways to deal with it. *Redirect…* asks for a target and saves a rule that leads there,
// *Answer 410* one that says the address is gone for good, each as the Admin's save of the
// redirect rules, which the next build serves; and *Hide* takes the address off the page while it
// goes on being counted. Each takes the address off the page at once. An Admin's alone, as the
// service says. It is React, since that is what Sveltia takes.

import { useAnswer } from '../admin-page.js';
import { signedInCredential } from '../credential.js';
import { languageTag, say } from '../interface-language.js';
import { wordsShown } from '../refusals.js';
import { sourceOf } from '../source.js';
import { hideNotFound, readNotFound, ruleMayBeMade, saveRule } from './client.js';
import './not-found.css';

const react = () => globalThis.__SVELTIA_CMS_REACT__;

// A moment as the page shows it, in the reader's own form and time zone, named.
const MOMENT = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
const momentShown = (at) => new Date(at).toLocaleString(languageTag(), MOMENT);

// The way to redirect one address: its target, asked for, and saved.
function RedirectForm({ address, busy, onSave, onCancel }) {
  const { createElement: h, useState } = react();
  const [to, setTo] = useState('');
  const id = `konzilo-not-found-target-${address}`;
  return h('form', {
    className: 'konzilo-not-found-redirect',
    onSubmit: (event) => {
      event.preventDefault();
      onSave(to.trim());
    },
  },
  h('label', { htmlFor: id }, say('notFound.target', { address })),
  h('input', { id, type: 'text', value: to, autoFocus: true, spellCheck: false, autoComplete: 'off', 'aria-describedby': `${id}-hint`, onChange: (event) => setTo(event.target.value) }),
  h('p', { id: `${id}-hint`, className: 'konzilo-not-found-note' }, say('notFound.targetHint')),
  h('div', { className: 'konzilo-not-found-ways' },
    h('button', { type: 'submit', className: 'konzilo-not-found-button', disabled: busy }, say('notFound.save')),
    h('button', { type: 'button', className: 'konzilo-not-found-button', onClick: onCancel }, say('notFound.cancel'))));
}

// `config`: Sveltia's configuration, which names the source the rules are saved to. `lock`: what
// registerLock() gives, which refuses a rule while an Admin's purge waits or runs (ADR 0078).
export function notFoundPage({ config, credential = signedInCredential, lock = null } = {}) {
  const { api, repository, branch } = sourceOf(config);
  return function KonziloNotFoundPage() {
    const { createElement: h, useState } = react();
    const [tried, setTried] = useState(0);
    // What the service answered: undefined until it has, null where it cannot be told, else as
    // readNotFound() answers; asked again at each *Try again*.
    const [shown, setShown] = useAnswer(() => readNotFound({ credential }), [tried]);
    // What the last thing done says: { words, alert }, or null.
    const [told, setTold] = useState(null);
    // The address a target is being asked for, or null.
    const [redirecting, setRedirecting] = useState(null);
    const [busy, setBusy] = useState(false);
    // A rule for `address`, a redirect to `to` or, without it, a 410, saved, and the list read
    // again, which no longer holds it.
    const makeRule = async (address, to) => {
      setBusy(true);
      setTold({ words: say('notFound.saving'), alert: false });
      try {
        const refusal = await lock?.purgeRefusal();
        const answer = refusal ? { refusal } : await saveRule({ api, repository, branch, credential, address, to });
        if (answer.refusal) {
          setTold({ words: wordsShown(answer.refusal), alert: true });
          return;
        }
        setRedirecting(null);
        setTold({ words: to === undefined ? say('notFound.answered', { address }) : say('notFound.redirected', { address, to }), alert: false });
        // Off the page at once, and the list read again, which a rule now holding it leaves out.
        setShown((held) => (held?.addresses ? { addresses: held.addresses.filter((one) => one.address !== address) } : held));
        const given = await readNotFound({ credential });
        if (given?.addresses) setShown(given);
      } catch (error) {
        console.warn(`The rule for ${address} could not be saved: ${error.message}`);
        setTold({ words: say('notFound.failed'), alert: true });
      } finally {
        setBusy(false);
      }
    };
    const hide = async (address) => {
      setBusy(true);
      const given = await hideNotFound({ credential, address });
      setBusy(false);
      if (given?.addresses) {
        setShown(given);
        setTold({ words: say('notFound.hidden', { address }), alert: false });
      } else {
        setTold({ words: say('notFound.hideFailed'), alert: true });
      }
    };

    const page = (...children) => h('div', { className: 'konzilo-not-found' }, ...children);
    if (shown === undefined) return page(h('p', { className: 'konzilo-not-found-note', role: 'status' }, say('notFound.loading')));
    if (shown === null) {
      return page(
        h('p', { className: 'konzilo-not-found-note', role: 'alert' }, say('notFound.unknown')),
        h('button', { type: 'button', className: 'konzilo-not-found-button', onClick: () => setTried(tried + 1) }, say('notFound.retry')));
    }
    if (shown.adminOnly) return page(h('p', { className: 'konzilo-not-found-note' }, say('notFound.adminOnly')));
    return page(
      h('p', { className: 'konzilo-not-found-note' }, say('notFound.intro')),
      h('p', { className: 'konzilo-not-found-told', role: told?.alert ? 'alert' : 'status' }, told?.words ?? ''),
      shown.addresses.length === 0
        ? h('p', { className: 'konzilo-not-found-note', role: 'status' }, say('notFound.none'))
        : h('table', { className: 'konzilo-not-found-table' },
          h('caption', null, say('notFound.list')),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, say('notFound.address')),
            h('th', { scope: 'col' }, say('notFound.count')),
            h('th', { scope: 'col' }, say('notFound.last')),
            h('th', { scope: 'col' }, say('notFound.actions')))),
          h('tbody', null, shown.addresses.map(({ address, count, last }) => h('tr', { key: address, 'data-address': address },
            h('th', { scope: 'row' }, h('code', null, address)),
            h('td', null, String(count)),
            h('td', null, h('time', { dateTime: last }, momentShown(last))),
            h('td', null, redirecting === address
              ? h(RedirectForm, { address, busy, onSave: (to) => makeRule(address, to), onCancel: () => setRedirecting(null) })
              : h('div', { className: 'konzilo-not-found-ways' },
                ...(ruleMayBeMade(address)
                  ? [
                      h('button', { type: 'button', className: 'konzilo-not-found-button', disabled: busy, 'aria-label': say('notFound.redirectOne', { address }), onClick: () => setRedirecting(address) }, say('notFound.redirect')),
                      h('button', { type: 'button', className: 'konzilo-not-found-button', disabled: busy, 'aria-label': say('notFound.answer410One', { address }), onClick: () => makeRule(address) }, say('notFound.answer410')),
                    ]
                  : [h('span', { className: 'konzilo-not-found-note' }, say('notFound.noRule'))]),
                h('button', { type: 'button', className: 'konzilo-not-found-button', disabled: busy, 'aria-label': say('notFound.hideOne', { address }), onClick: () => hide(address) }, say('notFound.hide')))))))));
  };
}
