// Signing in to the live preview in a tab of its own, through the site's Forgejo (ADR 0032):
// OAuth's authorization code with PKCE, as the preview's own public client, whose code the gate
// exchanges itself, server to server. The token it is given is used once, to ask whether its
// holder may see the preview, and kept nowhere; what it holds of a sign-in is the verifier and
// the address to come back to, for as long as a sign-in may take.

import { createHash, randomBytes } from 'node:crypto';

// Long enough to type a password and a code, and no longer.
export const SIGN_IN_LASTS = 10 * 60 * 1000;
// Sign-ins nobody finishes, which anyone may start, are forgotten oldest first past this.
const MOST_PENDING = 1000;
// What the preview asks of the repository: whether its holder may write to it, which reading
// it says.
const SCOPE = 'read:repository';

const random = () => randomBytes(32).toString('base64url');

// What a state is, as start() gives one: 32 random bytes in base64url. Nothing else that comes
// back as one is a sign-in this gate began.
export const STATE = /^[A-Za-z0-9_-]{43}$/;

// `forgejo`: where the gate reaches Forgejo; `forgejoOrigin`: where a browser does. `clientId`:
// the preview's OAuth client. `redirectUri`: the gate's address that Forgejo sends a browser
// back to.
export function forgejoSignIn({ forgejo, forgejoOrigin, clientId, redirectUri, now = Date.now, send = (...args) => fetch(...args) }) {
  const pending = new Map();

  return {
    // Where a browser goes to sign in, to come back to `path`, and the state it comes back with.
    start(path) {
      for (const [state, { until }] of pending) if (until <= now()) pending.delete(state);
      while (pending.size >= MOST_PENDING) pending.delete(pending.keys().next().value);
      const state = random();
      const verifier = random();
      pending.set(state, { verifier, path, until: now() + SIGN_IN_LASTS });
      const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      });
      return { location: `${forgejoOrigin}/login/oauth/authorize?${query}`, state };
    },

    // A browser come back with `state`, and with `code` where Forgejo gave one, which the gate has
    // seen it started (`bound`): { path, credential, unanswered }, the address it set out for, or
    // null where the state is none of these, a credential for Forgejo's API where the sign-in
    // went through, and whether Forgejo did not answer. Each state is taken once.
    async finish({ state, code, bound }) {
      const held = pending.get(state);
      pending.delete(state);
      const path = held?.path ?? null;
      if (!held || !bound || held.until <= now() || !code) return { path, credential: null, unanswered: false };
      let answer;
      try {
        answer = await send(`${forgejo}/login/oauth/access_token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: held.verifier }).toString(),
        });
      } catch {
        return { path, credential: null, unanswered: true };
      }
      if (answer.status >= 500) return { path, credential: null, unanswered: true };
      if (!answer.ok) return { path, credential: null, unanswered: false };
      const { access_token: token } = await answer.json().catch(() => ({}));
      return { path, credential: typeof token === 'string' && token !== '' ? `Bearer ${token}` : null, unanswered: false };
    },
  };
}
