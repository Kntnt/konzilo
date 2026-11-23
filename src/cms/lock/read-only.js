// Whether the form open in this tab is read-only (ADR 0073), for the core's own fields, which
// Sveltia does not tell: `readOnlyNow()`, and `onReadOnly(listener)`, which calls `listener` at
// each change until the function it gives is called. The lock's keeper sets it (register.js).

let readOnly = false;
const listeners = new Set();

export const readOnlyNow = () => readOnly;

export function setReadOnly(next) {
  if (next === readOnly) return;
  readOnly = next;
  for (const listener of [...listeners]) listener();
}

export function onReadOnly(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The same in a React control: whether the form is read-only, drawn again as it changes.
export const useReadOnly = (React) => React.useSyncExternalStore(onReadOnly, readOnlyNow);
