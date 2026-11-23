// The button in a post's form that opens its page in a tab of its own (ADR 0032), beside its
// History, so that it is there wherever the preview stands: beside the form, in a window of its
// own, or switched with it, while the preview shows a page for the form (in-tab.js).

import { made, madeButton } from '../elements.js';
import { say } from '../interface-language.js';
import { formOf } from '../lock/keeper.js';
import { pageShown, tabAddress } from './in-tab.js';
import './open-in-tab.css';

// The button, which the patched Sveltia asks for as it draws the rail of a form's panels,
// `konziloRail`, handing it the rail: shown while the preview shows a page for the form open.
export function registerOpenInTab({ origin }) {
  globalThis.konziloRail = (rail) => {
    const page = () => pageShown.shownFor(formOf(globalThis.location.hash));
    const button = madeButton('konzilo-open-in-tab', undefined, null, () => {
      const shownNow = page();
      if (shownNow) globalThis.open(tabAddress({ origin, ...shownNow }), '_blank', 'noopener');
    }, say('preview.openInTab'));
    button.title = say('preview.openInTab');
    made('span', 'material-symbols-outlined', button, 'open_in_new').setAttribute('aria-hidden', 'true');
    // Until the rail is gone with its form: drawn as it is shown, and let go after.
    let drawn = false;
    const follow = () => {
      drawn ||= button.isConnected;
      if (drawn && !button.isConnected) {
        stop();
        globalThis.removeEventListener('hashchange', follow);
        return;
      }
      button.hidden = page() === null;
    };
    const stop = pageShown.watch(follow);
    globalThis.addEventListener('hashchange', follow);
    rail.append(button);
    follow();
  };
}
