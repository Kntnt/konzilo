// What the editor's pages ask of the Node service (ADR 0044). The service asks Forgejo who is
// asking, so each request carries what Sveltia signed in with, and is never kept by the browser.

// The browser's own fetch, which a page asks the service by unless it is handed another.
export const fetching = () => globalThis.fetch.bind(globalThis);

// What the service answers one of the Admin's pages at `address`, asked with `init` and the
// credential `credential()` gives: { adminOnly } where the one asking may write and is no Admin,
// what `read(answer)` makes of any other answer, or null where nothing is signed in, or where the
// answer cannot be told.
export async function askAsAdmin(address, init, { credential, ask, read }) {
  const held = credential();
  if (!held) return null;
  try {
    const answer = await ask(address, { ...init, headers: { authorization: held, ...init.headers }, cache: 'no-store' });
    if (answer.status === 403) return { adminOnly: true };
    return await read(answer);
  } catch {
    return null;
  }
}
