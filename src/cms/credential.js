// What this browser signed in with: Sveltia keeps it, there and only there, and it is passed on
// to what asks Forgejo who is asking.

const USER = 'sveltia-cms.user';

export function signedInCredential() {
  try {
    const { token } = JSON.parse(globalThis.localStorage.getItem(USER)) ?? {};
    return token ? `token ${token}` : null;
  } catch {
    return null;
  }
}
