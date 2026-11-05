// The service's part for editors (ADR 0044): what starts a build, what a post's status is, and a
// small picture of an image in the library (ADR 0055). Forgejo's webhook only says that something may have happened: the
// build looks for itself, so a request here decides nothing, and needs no secret. Everything an
// editor asks goes by what Forgejo says of the one asking, each time.

import { publishStatus } from '../build/status.js';
import { mayWrite } from '../forgejo.js';

const answerJson = (outgoing, status, body) => {
  outgoing.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  outgoing.end(JSON.stringify(body));
};

export const nextMinute = (at) => 60_000 - (at % 60_000);

// A page of pictures would ask Forgejo once for each, about the same person, so an answer holds a
// moment: long enough for that page, and short enough that a person taken off the site is told no.
const ANSWER_HOLDS = 30_000;
const ANSWERS_AT_MOST = 256;
// A picture changes only with its file, which is seldom, and is looked at again within the hour.
const PICTURE_HOLDS = 3600;

// `forgejo`: where to ask. `repository`: the source repository. `token`: a credential that can
// read it. `control`: as record.js gives it. `isPost(file)`: whether a file in the source is a post.
// `pictures`: as thumbnails.js gives them.
export function editorsService({ forgejo, repository, token, control, pictures = null, isPost = () => true, now = () => new Date(), warn = console.error, get = fetch }) {
  const answers = new Map();
  const mayWriteLately = async (credential) => {
    const held = answers.get(credential);
    const moment = now().getTime();
    if (held && moment - held.at < ANSWER_HOLDS) return held.may;
    const may = await mayWrite({ forgejo, repository, credential, get });
    if (answers.size >= ANSWERS_AT_MOST) answers.clear();
    answers.set(credential, { may, at: moment });
    return may;
  };

  const answerPicture = async (incoming, outgoing, of) => {
    if (incoming.method !== 'GET') return answerJson(outgoing, 405, {});
    if (!pictures) return answerJson(outgoing, 404, {});
    if (!await mayWriteLately(incoming.headers.authorization)) return answerJson(outgoing, 401, {});
    const picture = await pictures.of(of);
    if (picture.status !== 200) return answerJson(outgoing, picture.status, {});
    const version = `"${picture.version}"`;
    const about = {
      etag: version,
      vary: 'authorization',
      'cache-control': `private, max-age=${PICTURE_HOLDS}`,
      'content-security-policy': "default-src 'none'; sandbox",
      'x-content-type-options': 'nosniff',
    };
    if (incoming.headers['if-none-match'] === version) {
      outgoing.writeHead(304, about);
      return outgoing.end();
    }
    outgoing.writeHead(200, { ...about, 'content-type': picture.type, 'content-length': picture.bytes.length });
    return outgoing.end(picture.bytes);
  };

  // Each file in the source as it stands, with its version.
  const versions = async () => {
    const found = {};
    for (let page = 1; ; page += 1) {
      const answer = await get(`${forgejo}/api/v1/repos/${repository}/git/trees/main?recursive=true&per_page=1000&page=${page}`, { headers: { authorization: `token ${token}` } });
      if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} about the source`);
      const { tree, truncated } = await answer.json();
      for (const { path, type, sha } of tree ?? []) if (type === 'blob') found[path] = sha;
      if (!truncated) return found;
    }
  };

  return {
    async request(incoming, outgoing) {
      const { pathname, searchParams } = new URL(incoming.url, 'http://service');
      if (pathname === '/health') return answerJson(outgoing, 200, { ok: true });
      if (pathname === '/webhook') {
        if (incoming.method !== 'POST') return answerJson(outgoing, 405, {});
        incoming.resume();
        control.request();
        return answerJson(outgoing, 202, {});
      }
      if (pathname === '/_konzilo/status') {
        if (incoming.method !== 'GET') return answerJson(outgoing, 405, {});
        if (!await mayWrite({ forgejo, repository, credential: incoming.headers.authorization, get })) return answerJson(outgoing, 401, {});
        const record = control.record();
        const standing = await versions();
        const posts = Object.entries(standing).filter(([file]) => isPost(file)).map(([file, version]) => publishStatus(record, file, version));
        return answerJson(outgoing, 200, { posts, others: { refusals: record?.refusals ?? [], warnings: record?.warnings ?? [] }, reason: record?.reason ?? null, at: record?.at ?? null });
      }
      if (pathname === '/_konzilo/thumbnail') return answerPicture(incoming, outgoing, searchParams.get('of'));
      return answerJson(outgoing, 404, {});
    },

    // What the clock asks for, at the start of each minute: a build when a scheduled moment has
    // passed, and when the source stands at a commit no build has read, as after a webhook that
    // never came, since Forgejo does not send one again.
    async tick() {
      const record = control.record();
      if (!record) return;
      if (record.next && new Date(record.next) <= now()) {
        control.request();
        return;
      }
      try {
        const answer = await get(`${forgejo}/api/v1/repos/${repository}/branches/main`, { headers: { authorization: `token ${token}` } });
        if (!answer.ok) throw new Error(`Forgejo answered ${answer.status}`);
        const { commit } = await answer.json();
        if (commit?.id && commit.id !== record.source) control.request();
      } catch (error) {
        warn(`The service could not see where the source stands: ${error.message}`);
      }
    },
  };
}
