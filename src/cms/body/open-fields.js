// The fields open on the page, so that a keyboard Save finds what was just typed in the
// draft. It reads the draft at the key press, sooner than a field's short wait to write.

const open = new Set();

export const fieldOpened = (field) => open.add(field);
export const fieldClosed = (field) => open.delete(field);

globalThis.document?.addEventListener('keydown', (event) => {
  if (!event.metaKey && !event.ctrlKey) return;
  if (event.key.toLowerCase() !== 's') return;
  for (const field of open) field.flush();
}, true);
