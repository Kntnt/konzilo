// The button in a post's form that opens its page in a tab of its own (ADR 0032), beside its
// History, so that it is there wherever the preview stands: beside the form, in a window of its
// own, or switched with it, while the preview shows a page for the form (in-tab.js).

import { say } from '../interface-language.js';
import { formOf } from '../lock/keeper.js';
import { pageShown, tabAddress } from './in-tab.js';
import './open-in-tab.css';

// The button, which the patched Sveltia asks for as it draws the rail of a form's panels,
// `konziloRail`, handing it the rail: shown while the preview shows a page for the form open.
export function registerOpenInTab({ origin }) {
  globalThis.konziloRail = (rail) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'konzilo-open-in-tab';
    button.setAttribute('aria-label', say('preview.openInTab'));
    button.title = say('preview.openInTab');
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'open_in_new';
    button.append(icon);
    const page = () => pageShown.shownFor(formOf(globalThis.location.hash));
    button.addEventListener('click', () => {
      const shownNow = page();
      if (shownNow) globalThis.open(tabAddress({ origin, ...shownNow }), '_blank', 'noopener');
    });
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
