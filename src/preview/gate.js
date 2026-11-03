// The live preview's gate (ADR 0032): the one thing the web server reaches on the preview's
// host, and it stands before anything else does. Only a browser that has shown write access
// through Forgejo gets past it, with a cookie for this host alone; nothing here holds the
// token it was shown. Its answers frame for the admin host alone and are never indexed
// or shared by a cache, whatever the dev server behind it would have said.

import { createHash, randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { connect } from 'node:net';

import { DRAFT_PATH, HEALTH_PATH, SESSION_PATH } from '../cms/preview/paths.js';

const SESSION_LIFE = 60 * 60 * 1000;
// A draft with its unsaved images, each at most what an original may be, in base64.
const MOST_BYTES = 64 * 1024 * 1024;
const CREDENTIAL = /^(?:token|Bearer) [\w.~+/=-]+$/;
const DROPPED = new Set(['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'reporting-endpoints', 'strict-transport-security', 'cache-control', 'x-robots-tag', 'set-cookie', 'connection', 'keep-alive', 'transfer-encoding']);

const digest = (secret) => createHash('sha256').update(secret).digest('hex');

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

// `origin`, `adminOrigin`: this host's and the editor's. `forgejo`: where to ask whether a
// credential may write to `repository`. `runner`, `dev`: runner.js's and dev-server.js's.
export function previewGate({ origin, adminOrigin, forgejo, repository, runner, dev, cookieName, now = Date.now, warn = console.error }) {
  const secure = new URL(origin).protocol === 'https:';
  const cookie = secure ? '__Host-konzilo-preview' : cookieName;
  const sessions = new Map();
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

  const hasSession = (incoming) => {
    const secret = cookieIn(incoming, cookie);
    if (!secret) return false;
    const until = sessions.get(digest(secret));
    return until !== undefined && until > now();
  };

  const mayWrite = async (credential) => {
    const asked = await fetch(`${forgejo}/api/v1/repos/${repository}`, { headers: { authorization: credential } });
    if (!asked.ok) return false;
    const { permissions } = await asked.json();
    return permissions?.push === true;
  };

  const openSession = async (incoming, outgoing) => {
    const credential = incoming.headers.authorization ?? '';
    if (!CREDENTIAL.test(credential)) return answer(outgoing, 401, { message: 'A session needs a credential from Forgejo.' }, forTheEditor);
    let allowed;
    try {
      allowed = await mayWrite(credential);
    } catch (error) {
      warn(`The preview could not ask Forgejo: ${error.message}`);
      return answer(outgoing, 502, { message: 'Forgejo does not answer.' }, forTheEditor);
    }
    if (!allowed) return answer(outgoing, 403, { message: 'Only someone who may write to this site has a preview.' }, forTheEditor);
    for (const [hash, until] of sessions) if (until <= now()) sessions.delete(hash);
    const secret = randomBytes(32).toString('base64url');
    sessions.set(digest(secret), now() + SESSION_LIFE);
    const attributes = [`${cookie}=${secret}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_LIFE / 1000}`, ...(secure ? ['Secure'] : [])];
    answer(outgoing, 200, { lasts: SESSION_LIFE }, { ...forTheEditor, 'Set-Cookie': attributes.join('; ') });
    // Someone has opened an entry: the first page is seconds away, not the time it takes to start.
    dev.ensure().catch((error) => warn(`The preview did not start: ${error.message}`));
    return undefined;
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
  const forwarded = (incoming) => {
    const { cookie: _cookie, origin: _origin, referer: _referer, ...headers } = incoming.headers;
    const others = (incoming.headers.cookie ?? '').split(';').map((pair) => pair.trim()).filter((pair) => pair !== '' && !pair.startsWith(`${cookie}=`));
    return { ...headers, host: `127.0.0.1:${dev.port}`, ...(others.length > 0 ? { cookie: others.join('; ') } : {}) };
  };

  const pass = (incoming, outgoing) => {
    const forward = request({ host: '127.0.0.1', port: dev.port, path: incoming.url, method: incoming.method, headers: forwarded(incoming) }, (from) => {
      const kept = Object.fromEntries(Object.entries(from.headers).filter(([name]) => !DROPPED.has(name)));
      if (kept.location?.startsWith(`http://127.0.0.1:${dev.port}`)) kept.location = kept.location.slice(`http://127.0.0.1:${dev.port}`.length) || '/';
      outgoing.writeHead(from.statusCode, { ...kept, ...own });
      from.pipe(outgoing);
    });
    forward.on('error', () => {
      if (outgoing.headersSent) outgoing.destroy();
      else answer(outgoing, 502, { message: 'The preview is not answering.' });
    });
    incoming.pipe(forward);
  };

  return {
    async request(incoming, outgoing) {
      const { pathname } = new URL(incoming.url, origin);
      if (pathname === HEALTH_PATH) return answer(outgoing, 200, { message: 'The gate stands.' });
      if (pathname === SESSION_PATH || pathname === DRAFT_PATH) {
        if (incoming.headers.origin !== adminOrigin) return answer(outgoing, 403, { message: 'Only the editor asks this.' });
        if (incoming.method === 'OPTIONS') {
          outgoing.writeHead(204, { ...own, ...forTheEditor, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' });
          return outgoing.end();
        }
        if (incoming.method !== 'POST') return answer(outgoing, 405, { message: 'This takes POST alone.' }, { ...forTheEditor, Allow: 'POST, OPTIONS' });
        if (pathname === SESSION_PATH) return openSession(incoming, outgoing);
        if (!hasSession(incoming)) return answer(outgoing, 401, { message: 'This preview\'s session has ended.' }, forTheEditor);
        return takeDraft(incoming, outgoing);
      }
      if (!hasSession(incoming)) return answer(outgoing, 403, { message: 'This preview is for people who may write to this site.' });
      const sends = incoming.method === 'POST' && pathname.startsWith('/_konzilo/');
      if (incoming.method !== 'GET' && incoming.method !== 'HEAD' && !sends) return answer(outgoing, 405, { message: 'A preview only shows pages.' }, { Allow: 'GET, HEAD' });
      try {
        await dev.ensure();
      } catch (error) {
        warn(`The preview did not start: ${error.message}`);
        return answer(outgoing, 503, { message: 'The preview did not start.' });
      }
      return pass(incoming, outgoing);
    },

    // A dev server's reloads come through a WebSocket, behind the same session.
    upgrade(incoming, socket, head) {
      if (!hasSession(incoming)) {
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
