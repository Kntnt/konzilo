// The service's part for editors (ADR 0044): what starts a build, what a post's status is, a
// small picture of an image in the library (ADR 0055), the forms' submissions (ADR 0045), and how
// the site mails them, which an Admin sets on the *Mail* page (ADR 0003). Forgejo's webhook only
// says that something may have happened: the build looks for itself, so a request here decides
// nothing, and needs no secret. Everything an editor asks goes by what Forgejo says of the one
// asking, each time.

import { ADMINS_TEAM } from '../build/roles.js';
import { publishStatus } from '../build/status.js';
import { CREDENTIAL, mayWrite } from '../forgejo.js';
import { FORM_NAME } from '../site-description.js';
import { FAILURE_SETTING, MAIL_SETTING } from './mail.js';
import { checkMailSettings, mailSettingsShown } from './mail-settings.js';
import { bodyOf } from './request-body.js';
import { SEPARATORS, submissionsCsv, timeZoneOf } from './submissions-csv.js';

const answerJson = (outgoing, status, body) => {
  outgoing.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  outgoing.end(JSON.stringify(body));
};

const SUBMISSIONS = '/_konzilo/submissions';
const MAIL = '/_konzilo/mail';
// The most the *Mail* page's settings take, as JSON.
const MAIL_BODY_LIMIT = 64 * 1024;
// A form's submissions are shown this many at a time, newest first.
const SUBMISSIONS_AT_ONCE = 50;

export const nextMinute = (at) => 60_000 - (at % 60_000);

// Until an answer has room for more, or is gone.
const drained = (outgoing) => new Promise((go) => {
  const goOn = () => {
    outgoing.off('drain', goOn);
    outgoing.off('close', goOn);
    go();
  };
  outgoing.on('drain', goOn);
  outgoing.on('close', goOn);
});

// A page of pictures would ask Forgejo once for each, about the same person, so an answer holds a
// moment: long enough for that page, and short enough that a person taken off the site is told no.
const ANSWER_HOLDS = 30_000;
const ANSWERS_AT_MOST = 256;
// A picture changes only with its file, which is seldom, and is looked at again within the hour.
const PICTURE_HOLDS = 3600;

// `forgejo`: where to ask. `repository`: the source repository. `token`: a credential that can
// read it. `rolesToken`: one that can read the organisation's teams, and so who is an Admin.
// `control`: as record.js gives it. `isPost(file)`: whether a file in the source is a post.
// `pictures`: as thumbnails.js gives them. `store`: the service's data, as store.js opens it, which
// holds the forms' submissions and how the site mails them, and `forms()`: the forms the site
// description in use declares. `local`: whether this is a local copy, which sends no mail.
export function editorsService({ forgejo, repository, token, rolesToken = null, control, pictures = null, store = null, forms = () => ({}), local = false, isPost = () => true, now = () => new Date(), warn = console.error, get = fetch }) {
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

  // Who is asking, as Forgejo says: `admin`, one in the organisation's team of Admins or the one
  // who runs the instance (ADR 0008); `writer`, anyone else who may write; or null. Who is in a
  // team Forgejo tells only those in it and the one who runs it, so the service asks by a
  // credential of its own that can read the teams and nothing else.
  const organisation = repository.split('/')[0];
  const asked = (path, credential) => get(`${forgejo}/api/v1${path}`, { headers: { authorization: credential } });
  const inAdmins = async (login) => {
    if (rolesToken === null) return false;
    const teams = await asked(`/orgs/${encodeURIComponent(organisation)}/teams?limit=50`, `token ${rolesToken}`);
    if (!teams.ok) throw new Error(`Forgejo answered ${teams.status} about the teams`);
    const team = (await teams.json()).find(({ name }) => name === ADMINS_TEAM);
    if (!team) return false;
    const member = await asked(`/teams/${team.id}/members/${encodeURIComponent(login)}`, `token ${rolesToken}`);
    if (member.status === 404) return false;
    if (!member.ok) throw new Error(`Forgejo answered ${member.status} about the team of Admins`);
    return true;
  };
  const roleOf = async (credential) => {
    if (!CREDENTIAL.test(credential ?? '')) return null;
    const me = await asked('/user', credential);
    if (!me.ok) return null;
    const { login, is_admin: runsTheInstance } = await me.json();
    if (runsTheInstance === true || (typeof login === 'string' && await inAdmins(login))) return 'admin';
    return await mayWrite({ forgejo, repository, credential, get }) ? 'writer' : null;
  };

  // How the site mails the forms' submissions, to an Admin alone: an Editor is told only that it is
  // an Admin's, and whoever may not write nothing. A save makes what waits to be tried again due
  // at once, since what failed may now go.
  const answerMail = async (incoming, outgoing) => {
    if (!['GET', 'PUT'].includes(incoming.method)) {
      incoming.resume();
      outgoing.writeHead(405, { allow: 'GET, PUT', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      return outgoing.end();
    }
    if (!store) return answerJson(outgoing, 404, {});
    const role = await roleOf(incoming.headers.authorization);
    if (role !== 'admin') {
      incoming.resume();
      return answerJson(outgoing, role === null ? 401 : 403, {});
    }
    const shown = () => mailSettingsShown({ store, forms: forms(), local });
    if (incoming.method === 'GET') return answerJson(outgoing, 200, shown());
    if ((incoming.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      incoming.resume();
      return answerJson(outgoing, 415, {});
    }
    if (Number(incoming.headers['content-length'] ?? 0) > MAIL_BODY_LIMIT) {
      outgoing.shouldKeepAlive = false;
      incoming.resume();
      return answerJson(outgoing, 413, {});
    }
    const body = await bodyOf(incoming, MAIL_BODY_LIMIT);
    if (body === null) {
      outgoing.shouldKeepAlive = false;
      return answerJson(outgoing, 413, {});
    }
    let given;
    try {
      given = JSON.parse(body.toString('utf8'));
    } catch {
      return answerJson(outgoing, 400, { problems: { '': 'malformed' } });
    }
    const checked = checkMailSettings(given, { store, forms: forms() });
    if (checked.problems) return answerJson(outgoing, 400, { problems: checked.problems });
    store.setSetting(MAIL_SETTING, checked.mail);
    for (const [form, recipients] of Object.entries(checked.recipients)) store.setFormSettings(form, { recipients });
    store.setSetting(FAILURE_SETTING, null);
    store.mailSoon(now());
    return answerJson(outgoing, 200, shown());
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

  // A form's submissions (ADR 0045), to Admins and Editors alone: each form with how many it holds,
  // a form's newest first, and a form's as CSV, by the separator, in the time zone and in the
  // interface language the reader names, spam left out. Whoever may not write is told nothing,
  // not even which forms there are.
  const answerSubmissions = async (incoming, outgoing, below, searchParams) => {
    if (incoming.method !== 'GET') return answerJson(outgoing, 405, {});
    if (!store) return answerJson(outgoing, 404, {});
    if (!await mayWrite({ forgejo, repository, credential: incoming.headers.authorization, get })) return answerJson(outgoing, 401, {});
    const declared = forms();
    const counts = store.counts();
    if (below === '') {
      const named = [...Object.keys(declared), ...Object.keys(counts).filter((name) => !Object.hasOwn(declared, name))];
      return answerJson(outgoing, 200, { forms: named.map((name) => ({ name, label: declared[name]?.label ?? name, count: counts[name] ?? 0 })) });
    }
    const [, name, asCsv] = /^\/([^/]+?)(\.csv)?$/.exec(below) ?? [];
    if (name === undefined || !FORM_NAME.test(name) || !(Object.hasOwn(declared, name) || Object.hasOwn(counts, name))) return answerJson(outgoing, 404, {});
    if (asCsv) {
      const separator = searchParams.get('separator');
      if (!Object.hasOwn(SEPARATORS, separator ?? '')) return answerJson(outgoing, 400, {});
      // The columns and the rows from one moment's data, which a submission kept between them
      // would otherwise leave without its label's column.
      const reading = store.snapshot(name);
      try {
        return await answerCsv(outgoing, name, submissionsCsv({
          label: declared[name]?.label ?? name,
          each: () => reading.each(),
          separator,
          timeZone: timeZoneOf(searchParams.get('timeZone')),
          language: searchParams.get('language'),
        }));
      } finally {
        reading.close();
      }
    }
    const before = searchParams.get('before');
    if (before !== null && !/^[1-9][0-9]{0,15}$/.test(before)) return answerJson(outgoing, 400, {});
    const shown = store.submissions(name, { spam: false, before: before === null ? null : Number(before), limit: SUBMISSIONS_AT_ONCE + 1 });
    return answerJson(outgoing, 200, {
      submissions: shown.slice(0, SUBMISSIONS_AT_ONCE).map(({ id, sentAt, language, fields }) => ({ id, sentAt, language, fields })),
      more: shown.length > SUBMISSIONS_AT_ONCE,
    });
  };

  // A file written a piece at a time, as its pieces are read, never held whole. Its first piece is
  // read before anything is answered, so that what breaks while the store is first read is a 500;
  // what breaks after it ends the answer unfinished, which a browser reports as a failed download
  // rather than keep a file cut short. Either is said in the service's log.
  const answerCsv = async (outgoing, name, pieces) => {
    const broke = (error) => warn(`The service could not write the submissions of ${name}: ${error.stack ?? error.message}`);
    let piece;
    try {
      piece = pieces.next();
    } catch (error) {
      broke(error);
      return answerJson(outgoing, 500, {});
    }
    outgoing.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8; header=present',
      'content-disposition': `attachment; filename="${name}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    try {
      for (; !piece.done; piece = pieces.next()) {
        if (outgoing.destroyed) return;
        if (!outgoing.write(piece.value)) await drained(outgoing);
      }
      outgoing.end();
    } catch (error) {
      broke(error);
      outgoing.destroy();
    } finally {
      pieces.return();
    }
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
      if (pathname === SUBMISSIONS || pathname.startsWith(`${SUBMISSIONS}/`)) return answerSubmissions(incoming, outgoing, pathname.slice(SUBMISSIONS.length), searchParams);
      if (pathname === MAIL) return answerMail(incoming, outgoing);
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
