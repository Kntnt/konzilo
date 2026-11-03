// The body field's React control, on a React of a few lines, since the loading it answers for
// takes a real network to see: what it opens on, and what it says when the field does not come.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bodyControl } from '../src/cms/body/control.js';

function aReact() {
  const slots = [];
  let at = 0;
  const pending = [];
  const react = {
    useRef(first) {
      const held = slots[at] ?? { current: first };
      slots[at] = held;
      at += 1;
      return held;
    },
    useEffect(run, keys) {
      const was = slots[at];
      const again = !was || keys.some((key, index) => key !== was.keys[index]);
      slots[at] = { keys, after: was?.after };
      if (again) pending.push([at, run]);
      at += 1;
    },
    createElement: () => null,
  };
  return {
    react,
    render(component, props, host) {
      at = 0;
      component(props);
      if (slots[0].current === null) slots[0].current = host;
      for (const [slot, run] of pending.splice(0)) slots[slot].after = run();
    },
  };
}

const props = (value) => ({
  value,
  onChange: () => {},
  forID: 'x',
  entry: { get: (key) => ({ collection: 'pages', slug: 'a' })[key] },
  field: { get: (key) => ({ name: 'body', elements: ['paragraph'], forms: [] })[key] },
});

const later = () => {
  const made = {};
  made.promise = new Promise((resolve, reject) => {
    made.resolve = resolve;
    made.reject = reject;
  });
  return made;
};

test('a value restored while the field is on its way is the value it opens on', async () => {
  const { react, render } = aReact();
  globalThis.window = { __SVELTIA_CMS_REACT__: react };
  const loading = later();
  const Control = bodyControl({ adminHost: null, load: () => loading.promise });
  const opened = [];
  const host = {};
  render(Control, props('as it was'), host);
  render(Control, props('as restored from a backup'), host);
  loading.resolve({
    mountBodyField: (_, { value }) => {
      opened.push(value);
      return { setValue() {}, flush() {}, frame: { remove() {} }, value };
    },
  });
  await loading.promise;
  await new Promise(setImmediate);
  assert.deepEqual(opened, ['as restored from a backup']);
});

test('says so when the field does not load', async () => {
  const { react, render } = aReact();
  globalThis.window = { __SVELTIA_CMS_REACT__: react };
  const loading = later();
  const Control = bodyControl({ adminHost: null, load: () => loading.promise });
  const host = {};
  render(Control, props('a body'), host);
  loading.reject(new Error('no such file'));
  await new Promise(setImmediate);
  assert.match(host.textContent, /could not load/);
});
