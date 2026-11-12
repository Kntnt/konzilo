// The live preview's gate (ADR 0032): the one thing the web server reaches on the preview's
// host, and it stands before anything else does. Only a browser that has shown access to the
// source through Forgejo gets past it, the pane's by the editor's credential, which may write,
// and a tab's by Forgejo's sign-in, whose person may read it, as a Reviewer does (ADR 0008),
// with a cookie for this host alone, and is asked again at intervals; nothing here holds the
// token it was shown. A session remembers whether its person may write, and only one that may
// sends a draft. Every page it shows in a tab of its own has the toolbar, which says what the
// page is built from and leads someone who may write to its form. Its answers frame for the admin
// host alone and are never indexed or shared by a cache, whatever the dev server behind it would
// have said.

import { createHash, randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { connect } from 'node:net';

import { DRAFT_PATH, HEALTH_PATH, SESSION_PATH, SIGN_IN_PATH, WHERE_PATH } from '../cms/preview/paths.js';
import { accessTo, CREDENTIAL } from '../forgejo.js';
import { forgejoSignIn, SIGN_IN_LASTS, STATE } from './sign-in.js';
import { refusalIn, TAB_PAGES, tabPage } from './tab-page.js';
import { toolbarOf, toolbarScript, withToolbar } from './toolbar.js';

// Whether its person may still see the preview is asked again this often: in a tab by the next
// page they open, which goes through Forgejo's sign-in again, at once while they are signed in
// there, and in the pane by its next draft, which opens a session anew with the editor's
// credential.
const CHECK_EVERY = 10 * 60 * 1000;
// How long a session lasts after it was last asked, for what cannot be led to a sign-in: what a
// page asks for itself, and a frame.
const SESSION_LIFE = 60 * 60 * 1000;
// How often a page that says the preview is starting looks again, in seconds.
const LOOKS_AGAIN = 2;
// How long a start that failed is told of to the next page asked for: while someone waits for it.
const FAILURE_TOLD = 60 * 1000;
// A draft with its unsaved images, each at most what an original may be, in base64.
const MOST_BYTES = 64 * 1024 * 1024;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
// What the dev server answers the 404 page with, wherever nothing else answers or a rule says so.
const NOT_FOUND = new Set([404, 410]);
// As many steps of a redirect as are followed, about what a visitor's browser would take.
const MOST_STEPS = 10;
const DROPPED = new Set(['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'reporting-endpoints', 'strict-transport-security', 'cache-control', 'x-robots-tag', 'set-cookie', 'connection', 'keep-alive', 'transfer-encoding']);
// What a page with the toolbar in it is asked for without, so that the dev server gives the whole
// page, unpacked, and what it says of the page it gave, which the toolbar makes another.
const ASKED_WHOLE = ['accept-encoding', 'if-none-match', 'if-modified-since'];
const OF_THE_PAGE = new Set(['content-length', 'etag', 'last-modified']);

const digest = (secret) => createHash('sha256').update(secret).digest('hex');

// A page asked for in a tab of its own, which may be led to a sign-in and back: not a frame's,
// and not what a page asks for itself. A browser too old to say so says it takes HTML.
const isPage = (incoming) => incoming.method === 'GET' && (incoming.headers['sec-fetch-dest'] !== undefined
  ? incoming.headers['sec-fetch-dest'] === 'document'
  : /(^|,)\s*text\/html/.test(incoming.headers.accept ?? ''));

// A path on this host to come back to, and never one a browser would read as another host's.
const pathOn = (url) => (/^\/(?![/\\])/.test(url.pathname) ? `${url.pathname}${url.search}` : '/');

const cookieIn = (incoming, name) => (incoming.headers.cookie ?? '').split(';').map((pair) => pair.trim()).find((pair) => pair.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;

async function bodyOf(incoming) {
  const parts = [];
  let size = 0;
  for await (const part of incoming) {
    size += part.length;
    if (size > MOST_BYTES) return null;
    parts.push(part);
  }
  return Buffer.concat(parts);
}

// `origin`, `adminOrigin`: this host's and the editor's. `forgejo`: where to ask what a
// credential may do with `repository`, and `forgejoOrigin` where a browser signs in to it, as
// the OAuth client `clientId`; without one, the preview is the pane's alone. `language`: the
// interface language its own pages are in. `runner`, `dev`: runner.js's and dev-server.js's.
export function previewGate({ origin, adminOrigin, forgejo, forgejoOrigin = null, clientId = null, language = 'en', repository, runner, dev, cookieName, now = Date.now, warn = console.error }) {
  const secure = new URL(origin).protocol === 'https:';
  const cookie = secure ? '__Host-konzilo-preview' : cookieName;
  // A browser's own sign-in, one cookie for each, so that tabs that sign in at once keep theirs; a
  // `__Host-` name would have to be for every path. `state` is one the gate gave (STATE).
  const signInCookie = (state) => `${secure ? '__Secure-konzilo-preview-sign-in' : `${cookieName}_sign_in`}_${state.slice(0, 12)}`;
  // A cookie for this host alone, which no page's script reads and no other site's page sends, at
  // `path`, for `lasts` milliseconds, and ended where that is none.
  const cookieOf = (name, value, { path = '/', lasts }) => [`${name}=${value}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${lasts / 1000}`, ...(secure ? ['Secure'] : [])].join('; ');
  const signIn = clientId && forgejoOrigin ? forgejoSignIn({ forgejo, forgejoOrigin, clientId, redirectUri: `${origin}${SIGN_IN_PATH}`, now }) : null;
  const sessions = new Map();
  // When the dev server last failed to start, while a page waiting for it may tell of it.
  let failedAt = null;
  const own = {
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `frame-ancestors ${adminOrigin}`,
  };
  const forTheEditor = { 'Access-Control-Allow-Origin': adminOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' };

  const answer = (outgoing, status, value, headers = {}) => {
    outgoing.writeHead(status, { ...own, 'Content-Type': 'application/json; charset=utf-8', ...headers });
    outgoing.end(`${JSON.stringify(value)}\n`);
  };

  // One of the preview's own pages, which loads nothing and runs nothing, but the toolbar where
  // it is given, allowed by its hash.
  const page = (outgoing, status, which, { again, refresh, values, items, toolbar = null, headers = {} } = {}) => {
    const script = toolbar === null ? null : toolbarScript(toolbar);
    const scripts = script === null ? '' : ` script-src 'sha256-${createHash('sha256').update(script).digest('base64')}';`;
    outgoing.writeHead(status, {
      ...own,
      'Content-Security-Policy': `default-src 'none';${scripts} style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors ${adminOrigin}`,
      'Content-Type': 'text/html; charset=utf-8',
      ...headers,
    });
    outgoing.end(tabPage(which, language, { again, refresh, values, items, script }));
  };

  // A page asked for in a tab of its own shows what is saved: the preview reads it first, and
  // goes on with what it has where that breaks. Gives what the page at `path` is built from, as
  // the runner's at() gives it: a saved post it refuses is shown in place of a page. A frame keeps
  // the last good page, which its pane names the refusal above.
  const builtFrom = async (path) => {
    try {
      await runner.refresh();
    } catch (error) {
      warn(`The preview could not read what is saved: ${error.message}`);
    }
    return runner.at(path);
  };

  // The dev server, started where it is not running, with nobody waiting for it here.
  const start = () => dev.ensure().catch((error) => {
    failedAt = now();
    warn(`The preview did not start: ${error.message}`);
  });

  // A page asked for while the dev server is not ready: it starts, and a page that says so looks
  // again until it is, or says that it did not start, once, with a link to try again.
  const starting = (incoming, outgoing) => {
    const failed = failedAt !== null && now() - failedAt < FAILURE_TOLD;
    failedAt = null;
    if (failed) return page(outgoing, 503, TAB_PAGES.notStarted, { again: pathOn(new URL(incoming.url, origin)) });
    start();
    return page(outgoing, 503, TAB_PAGES.starting, { refresh: LOOKS_AGAIN, headers: { 'Retry-After': String(LOOKS_AGAIN) } });
  };

  // To Forgejo's sign-in, to come back to the page asked for.
  const toSignIn = (incoming, outgoing) => {
    const { location, state } = signIn.start(pathOn(new URL(incoming.url, origin)));
    outgoing.writeHead(303, { ...own, Location: location, 'Set-Cookie': cookieOf(signInCookie(state), state, { path: SIGN_IN_PATH, lasts: SIGN_IN_LASTS }) });
    outgoing.end();
  };

  // The session a request holds, { key, fresh, writes }, where `fresh` says that it was asked
  // within the interval and `writes` that its person may write to the source, or null.
  const sessionIn = (incoming) => {
    const secret = cookieIn(incoming, cookie);
    if (!secret) return null;
    const key = digest(secret);
    const held = sessions.get(key);
    if (held === undefined || held.checked + SESSION_LIFE <= now()) return null;
    return { key, fresh: held.checked + CHECK_EVERY > now(), writes: held.writes };
  };
  const hasSession = (incoming) => sessionIn(incoming) !== null;

  // A new session, as the cookie that holds it, in place of any the request holds, for someone
  // who `writes` to the source or reads it alone. Someone has opened an entry or a page: the
  // first page is seconds away, not the time it takes to start.
  const opened = (incoming, writes) => {
    const held = sessionIn(incoming);
    if (held) sessions.delete(held.key);
    for (const [key, { checked }] of sessions) if (checked + SESSION_LIFE <= now()) sessions.delete(key);
    const secret = randomBytes(32).toString('base64url');
    sessions.set(digest(secret), { checked: now(), writes });
    start();
    return cookieOf(cookie, secret, { lasts: SESSION_LIFE });
  };

  // No session, for someone who may no longer see the preview.
  const ended = (incoming) => {
    const held = sessionIn(incoming);
    if (held) sessions.delete(held.key);
    return cookieOf(cookie, '', { lasts: 0 });
  };

  const openSession = async (incoming, outgoing) => {
    const credential = incoming.headers.authorization ?? '';
    if (!CREDENTIAL.test(credential)) return answer(outgoing, 401, { message: 'A session needs a credential from Forgejo.' }, forTheEditor);
    let access;
    try {
      access = await accessTo({ forgejo, repository, credential });
    } catch (error) {
      warn(`The preview could not ask Forgejo: ${error.message}`);
      return answer(outgoing, 502, { message: 'Forgejo does not answer.' }, forTheEditor);
    }
    // The pane is the editor's, which a Reviewer never opens.
    if (!access.writes) return answer(outgoing, 403, { message: 'Only someone who may write to this site has a preview beside the form.' }, forTheEditor);
    return answer(outgoing, 200, { lasts: SESSION_LIFE }, { ...forTheEditor, 'Set-Cookie': opened(incoming, true) });
  };

  // A browser back from Forgejo's sign-in: to the page it set out for, with a session, where its
  // person may see the preview, which whoever may read the source may. Whatever Forgejo gave is
  // used for that question alone. A state of another shape than the gate gives is no sign-in it
  // began, and nothing is made of it, not even the name of a cookie to end.
  const backFromSignIn = async (incoming, outgoing) => {
    const query = new URL(incoming.url, origin).searchParams;
    const state = query.get('state') ?? '';
    if (!STATE.test(state)) return page(outgoing, 400, TAB_PAGES.signInFailed, { again: '/' });
    const name = signInCookie(state);
    const used = cookieOf(name, '', { path: SIGN_IN_PATH, lasts: 0 });
    const { path, credential, unanswered } = await signIn.finish({ state, code: query.get('code'), bound: cookieIn(incoming, name) === state });
    const again = path ?? '/';
    if (!credential) return page(outgoing, unanswered ? 502 : 400, unanswered ? TAB_PAGES.forgejoDown : TAB_PAGES.signInFailed, { again, headers: { 'Set-Cookie': used } });
    let access;
    try {
      access = await accessTo({ forgejo, repository, credential });
    } catch (error) {
      warn(`The preview could not ask Forgejo: ${error.message}`);
      return page(outgoing, 502, TAB_PAGES.forgejoDown, { again, headers: { 'Set-Cookie': used } });
    }
    if (!access.reads) return page(outgoing, 403, TAB_PAGES.refused, { headers: { 'Set-Cookie': [used, ended(incoming)] } });
    outgoing.writeHead(303, { ...own, Location: path, 'Set-Cookie': [used, opened(incoming, access.writes)] });
    return outgoing.end();
  };

  const takeDraft = async (incoming, outgoing) => {
    const bytes = await bodyOf(incoming);
    if (bytes === null) return answer(outgoing, 413, { message: 'This draft is too large to preview.' }, forTheEditor);
    let draft;
    try {
      draft = JSON.parse(bytes.toString('utf8'));
    } catch {
      return answer(outgoing, 400, { message: 'A draft is JSON.' }, forTheEditor);
    }
    const problem = runner.problem(draft);
    if (problem) return answer(outgoing, 400, { message: problem }, forTheEditor);
    try {
      const shown = await runner.take(draft);
      await dev.ensure();
      return answer(outgoing, 200, shown, forTheEditor);
    } catch (error) {
      warn(`The preview broke: ${error.stack ?? error.message}`);
      return answer(outgoing, 500, { message: 'The preview broke, and shows the last good page.' }, forTheEditor);
    }
  };

  // What the dev server is told: nothing of the session, and nothing of where it was reached.
  // `whole`: that the page is wanted whole, for the toolbar.
  const forwarded = (incoming, whole = false) => {
    const { cookie: _cookie, origin: _origin, referer: _referer, ...headers } = incoming.headers;
    if (whole) for (const name of ASKED_WHOLE) delete headers[name];
    const others = (incoming.headers.cookie ?? '').split(';').map((pair) => pair.trim()).filter((pair) => pair !== '' && !pair.startsWith(`${cookie}=`));
    return { ...headers, host: `127.0.0.1:${dev.port}`, ...(others.length > 0 ? { cookie: others.join('; ') } : {}) };
  };

  // Whether the dev server's answer is a page the toolbar goes into.
  const takesToolbar = (from) => from.statusCode >= 200 && ![204, 304].includes(from.statusCode) && !REDIRECTS.has(from.statusCode)
    && /^text\/html\b/i.test(from.headers['content-type'] ?? '') && from.headers['content-encoding'] === undefined;

  // A frame that follows a redirect has left the page its editor works on, and no script in a
  // page can stop that. With nothing to show, a browser leaves the frame as it is, and nothing
  // runs again that could try the same thing.
  const keptFromFollowing = (incoming, from) => incoming.headers['sec-fetch-dest'] === 'iframe' && REDIRECTS.has(from.statusCode);

  // The dev server's answer, with the toolbar `toolbarFor(status)` gives for its status in it, where
  // it is a page and one is given.
  const pass = (incoming, outgoing, toolbarFor = null) => {
    const forward = request({ host: '127.0.0.1', port: dev.port, path: incoming.url, method: incoming.method, headers: forwarded(incoming, toolbarFor !== null) }, async (from) => {
      if (keptFromFollowing(incoming, from)) {
        from.resume();
        outgoing.writeHead(204, own);
        return outgoing.end();
      }
      const kept = Object.fromEntries(Object.entries(from.headers).filter(([name]) => !DROPPED.has(name)));
      if (kept.location?.startsWith(`http://127.0.0.1:${dev.port}`)) kept.location = kept.location.slice(`http://127.0.0.1:${dev.port}`.length) || '/';
      if (toolbarFor === null || !takesToolbar(from)) {
        outgoing.writeHead(from.statusCode, { ...kept, ...own });
        return from.pipe(outgoing);
      }
      const parts = [];
      try {
        for await (const part of from) parts.push(part);
      } catch {
        return outgoing.destroy();
      }
      const shown = Buffer.from(withToolbar(Buffer.concat(parts).toString('utf8'), toolbarFor(from.statusCode)), 'utf8');
      const rest = Object.fromEntries(Object.entries(kept).filter(([name]) => !OF_THE_PAGE.has(name)));
      outgoing.writeHead(from.statusCode, { ...rest, ...own, 'Content-Length': String(shown.length) });
      return outgoing.end(shown);
    });
    forward.on('error', () => {
      if (outgoing.headersSent) outgoing.destroy();
      else answer(outgoing, 502, { message: 'The preview is not answering.' });
    });
    incoming.pipe(forward);
  };

  const answerAt = (path) => new Promise((resolve, reject) => {
    const asked = request({ host: '127.0.0.1', port: dev.port, path, method: 'GET', headers: { host: `127.0.0.1:${dev.port}`, accept: 'text/html' } }, (from) => {
      from.resume();
      resolve({ status: from.statusCode, location: from.headers.location ?? null });
    });
    asked.on('error', reject);
    asked.end();
  });

  // What a visitor meets at a path of this site: { status, redirect, loop }, the status it ends
  // at, null if it does not end here, and { status, to } where it is led on: the first step's
  // status and the last step's target. A circle, or a chain as good as one, ends with `loop`.
  const leadsFrom = async (path) => {
    const inner = `http://127.0.0.1:${dev.port}`;
    const passed = new Set([path]);
    let at = path;
    let redirect = null;
    for (let step = 0; step < MOST_STEPS; step += 1) {
      const { status, location } = await answerAt(at);
      if (!REDIRECTS.has(status) || location === null) return { status, redirect, loop: false };
      const next = new URL(location, inner);
      const here = next.origin === inner || next.origin === origin;
      const to = here ? `${next.pathname}${next.search}` : next.href;
      redirect = { status: redirect?.status ?? status, to };
      if (!here) return { status: null, redirect, loop: false };
      if (passed.has(to)) break;
      passed.add(to);
      at = to;
    }
    return { status: null, redirect: null, loop: true };
  };

  const tellWhere = async (incoming, outgoing) => {
    const asked = new URL(incoming.url, origin).searchParams.get('to') ?? '';
    const path = /^\/(?![/\\])/.test(asked) ? new URL(asked, origin) : null;
    if (path === null) return answer(outgoing, 400, { message: 'This asks about a path on this site.' }, forTheEditor);
    try {
      await dev.ensure();
    } catch (error) {
      warn(`The preview did not start: ${error.message}`);
      return answer(outgoing, 503, { message: 'The preview did not start.' }, forTheEditor);
    }
    try {
      return answer(outgoing, 200, await leadsFrom(`${path.pathname}${path.search}`), forTheEditor);
    } catch {
      return answer(outgoing, 502, { message: 'The preview is not answering.' }, forTheEditor);
    }
  };

  return {
    async request(incoming, outgoing) {
      const { pathname } = new URL(incoming.url, origin);
      if (pathname === HEALTH_PATH) return answer(outgoing, 200, { message: 'The gate stands.' });
      if (pathname === SIGN_IN_PATH && signIn) {
        if (incoming.method !== 'GET') return answer(outgoing, 405, { message: 'This takes GET alone.' }, { Allow: 'GET' });
        return backFromSignIn(incoming, outgoing);
      }
      if (pathname === WHERE_PATH) {
        if (incoming.headers.origin !== adminOrigin) return answer(outgoing, 403, { message: 'Only the editor asks this.' });
        if (incoming.method !== 'GET') return answer(outgoing, 405, { message: 'This takes GET alone.' }, { ...forTheEditor, Allow: 'GET' });
        if (!hasSession(incoming)) return answer(outgoing, 401, { message: 'This preview\'s session has ended.' }, forTheEditor);
        return tellWhere(incoming, outgoing);
      }
      if (pathname === SESSION_PATH || pathname === DRAFT_PATH) {
        if (incoming.headers.origin !== adminOrigin) return answer(outgoing, 403, { message: 'Only the editor asks this.' });
        if (incoming.method === 'OPTIONS') {
          outgoing.writeHead(204, { ...own, ...forTheEditor, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' });
          return outgoing.end();
        }
        if (incoming.method !== 'POST') return answer(outgoing, 405, { message: 'This takes POST alone.' }, { ...forTheEditor, Allow: 'POST, OPTIONS' });
        if (pathname === SESSION_PATH) return openSession(incoming, outgoing);
        const held = sessionIn(incoming);
        if (!held?.fresh) return answer(outgoing, 401, { message: 'This preview\'s session has ended.' }, forTheEditor);
        if (!held.writes) return answer(outgoing, 403, { message: 'Only someone who may write to this site sends a draft.' }, forTheEditor);
        return takeDraft(incoming, outgoing);
      }
      const held = sessionIn(incoming);
      if (signIn && isPage(incoming) && !held?.fresh) return toSignIn(incoming, outgoing);
      if (!held) return answer(outgoing, 403, { message: 'This preview is for the site\'s Admins, Editors and Reviewers.' });
      const sends = incoming.method === 'POST' && pathname.startsWith('/_konzilo/');
      if (incoming.method !== 'GET' && incoming.method !== 'HEAD' && !sends) return answer(outgoing, 405, { message: 'A preview only shows pages.' }, { Allow: 'GET, HEAD' });
      if (isPage(incoming) && !dev.ready()) return starting(incoming, outgoing);
      const about = isPage(incoming) ? await builtFrom(pathname) : null;
      // The toolbar of the page the dev server answers with `status`: what it is built from, and
      // the 404 page's, the post an Admin chose for it, where nothing else answers.
      const toolbarFor = isPage(incoming) ? (status) => toolbarOf({ about: about ?? (NOT_FOUND.has(status) ? runner.notFoundAt(pathname) : null), writes: held.writes, language, adminOrigin }) : null;
      if (about?.refusals.length > 0) return page(outgoing, 200, TAB_PAGES.postRefused, { values: { title: about.title }, items: about.refusals.map((one) => refusalIn(language, one)), toolbar: toolbarFor(200) });
      try {
        await dev.ensure();
      } catch (error) {
        warn(`The preview did not start: ${error.message}`);
        return answer(outgoing, 503, { message: 'The preview did not start.' });
      }
      return pass(incoming, outgoing, toolbarFor);
    },

    // A dev server's reloads come through a WebSocket, behind the same session.
    upgrade(incoming, socket, head) {
      // A cookie goes along with a socket from anywhere, so it must be this host's own page.
      if (!hasSession(incoming) || incoming.headers.origin !== origin) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }
      dev.ensure().then(() => {
        const upstream = connect(dev.port, '127.0.0.1', () => {
          const lines = Object.entries(forwarded(incoming)).flatMap(([name, value]) => (Array.isArray(value) ? value : [value]).map((one) => `${name}: ${one}`));
          upstream.write(`${incoming.method} ${incoming.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
          if (head.length > 0) upstream.write(head);
          socket.pipe(upstream);
          upstream.pipe(socket);
        });
        const end = () => {
          upstream.destroy();
          socket.destroy();
        };
        upstream.on('error', end);
        socket.on('error', end);
      }, () => socket.destroy());
    },
  };
}
