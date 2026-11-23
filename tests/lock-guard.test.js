// The read-only state of the core's own fields (ADR 0073), in a page under jsdom: in a read-only
// form what would change a field goes nowhere, what moves, selects and copies does, the core's
// buttons do nothing while Sveltia's own, which open and close, still work, and each field that
// can be written in says it is read-only, until the form may be changed again.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { guardReadOnly } from '../src/cms/lock/guard.js';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

const page = () => {
  const { window } = new JSDOM(`<!doctype html><body>
    <div data-mode="edit">
      <section data-field-type="string"><input id="sveltia" value="a title"><button id="open">Open</button></section>
      <section data-field-type="konzilo-body"><div id="body" contenteditable="true">Some text</div><button id="core">Remove</button></section>
    </div>
    <div class="konzilo-lock-line"><button id="line">Take over</button></div>
  </body>`);
  let readOnly = true;
  let follower = () => {};
  guardReadOnly(window.document, { readOnly: () => readOnly, follow: (listener) => { follower = listener; } });
  const set = (next) => {
    readOnly = next;
    follower(next);
  };
  const fire = (id, type, init = {}) => {
    const event = type === 'keydown' ? new window.KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }) : new window.Event(type, { bubbles: true, cancelable: true });
    window.document.getElementById(id).dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { window, document: window.document, set, fire };
};

test('holds back what would change a read-only form, and lets through what moves, selects and copies', () => {
  const { fire, set } = page();
  set(true);
  assert.equal(fire('body', 'beforeinput'), true);
  assert.equal(fire('body', 'paste'), true);
  assert.equal(fire('body', 'keydown', { key: 'Enter' }), true);
  assert.equal(fire('body', 'keydown', { key: 'x' }), true);
  assert.equal(fire('sveltia', 'keydown', { key: 'Backspace' }), true);
  assert.equal(fire('body', 'keydown', { key: 'ArrowDown' }), false);
  assert.equal(fire('body', 'keydown', { key: 'Tab' }), false);
  assert.equal(fire('body', 'keydown', { key: 'c', metaKey: true }), false);
  assert.equal(fire('body', 'keydown', { key: 'a', ctrlKey: true }), false);
});

test('stops the core\'s buttons and leaves Sveltia\'s own and the line\'s alone', () => {
  const { fire, set } = page();
  set(true);
  assert.equal(fire('core', 'click'), true);
  assert.equal(fire('core', 'keydown', { key: 'Enter' }), true);
  assert.equal(fire('open', 'click'), false);
  assert.equal(fire('open', 'keydown', { key: 'Enter' }), false);
  assert.equal(fire('line', 'click'), false);
});

test('changes nothing while the form may be changed, and says read-only to a screen reader only while it is read-only', async () => {
  const { fire, set, document } = page();
  set(false);
  assert.equal(fire('body', 'beforeinput'), false);
  assert.equal(document.getElementById('body').getAttribute('aria-readonly'), null);
  set(true);
  assert.equal(document.getElementById('body').getAttribute('aria-readonly'), 'true');
  assert.equal(document.getElementById('sveltia').getAttribute('aria-readonly'), 'true');
  set(false);
  assert.equal(document.getElementById('body').getAttribute('aria-readonly'), null);
});
