// The service's part for editors (ADR 0044): what starts a build, what a post's status is, a
// small picture of an image in the library (ADR 0055), the forms' submissions (ADR 0045), how the
// site mails them and how long it keeps them, which an Admin sets on the *Mail* page (ADR 0003),
// a person's submissions, which an Admin finds, downloads and erases on the *Personal data*
// page, the consent records (ADR 0049), which an Admin reads on the *Consent records* page, the
// addresses visitors asked for in vain, which an Admin reads and hides on the *Addresses not
// found* page (ADR 0040), the counts of what the site's policy blocked, which an Admin reads on
// *Policy violations* (ADR 0051), and the incoming feeds an Admin adds, changes and removes on the
// *Feeds* page (ADR 0079), whose posts no form saves. Forgejo's webhook only says that something
// may have happened: the build looks for itself, so a request here decides nothing, and needs no
// secret. Everything an editor asks goes by what Forgejo says of the one asking, each time. Each
// of the Admin's pages but *Personal data* is a module of its own, which owns its paths and answers
// them as answers.js does; this routes each request to it.

import { ADMINS_TEAM } from '../build/roles.js';
import { publishStatus } from '../build/status.js';
import { accountName, CREDENTIAL, mayWrite, organisationTeams } from '../forgejo.js';
import { FORM_NAME } from '../site-description.js';
import { answerCsv, answerJson, answerMethods, asAdmin, jsonOf } from './answers.js';
import { consentRecordsPage } from './consent-records-admin.js';
import { refusedPosts } from './feed-settings.js';
import { feedsPage } from './feeds-admin.js';
import { isAdminsForm, isForm, isTab, lockTable } from './locks.js';
import { mailPage } from './mail-admin.js';
import { notFoundPage } from './not-found-admin.js';
import { findSubmissions, idsOf, soughtOf } from './personal-data.js';
import { passageOf } from '../purge/passage.js';
import { purgeKeeper } from './purge.js';
import { isSourcePath, sourceHistory } from './revisions.js';
import { SEPARATORS, submissionsCsv, timeZoneOf } from './submissions-csv.js';
import { violationsPage } from './violations-admin.js';

const SUBMISSIONS = '/_konzilo/submissions';
const PERSONAL_DATA = '/_konzilo/personal-data';
const LOCKS = '/_konzilo/locks';
const REVISIONS = '/_konzilo/revisions';
const DELETED = '/_konzilo/deleted';
const PURGE = '/_konzilo/purge';
const PURGE_SEARCH = '/_konzilo/purge/search';
// The most an Admin's purge takes, as JSON.
const PURGE_LIMIT = 4096;
// A form's submissions are shown this many at a time, newest first.
const SUBMISSIONS_AT_ONCE = 50;

export const nextMinute = (at) => 60_000 - (at % 60_000);

// A page of pictures would ask Forgejo once for each, about the same person, so an answer holds a
// moment: long enough for that page, and short enough that a person taken off the site is told no.
const ANSWER_HOLDS = 30_000;
const ANSWERS_AT_MOST = 256;
// A picture changes only with its file, which is seldom, and is looked at again within the hour.
const PICTURE_HOLDS = 3600;

// `forgejo`: where to ask. `repository`: the source repository. `token`: a credential that can
// read it. `rolesToken`: one that can read the organisation's teams, and so who is an Admin.
// `pushesToken`: one that can read who pushed each commit, which the feed shows of a private account
// only to the instance's account, else `token`.
// `control`: as record.js gives it. `isPost(file)`: whether a file in the source is a post.
// `pictures`: as thumbnails.js gives them. `store`: the service's data, as store.js opens it, which
// holds the forms' submissions and how the site mails them, and `forms()`: the forms the site
// description in use declares. `local`: whether this is a local copy, which sends no mail.
// `locks`: how the locks of the editor's forms wait, { waitAtMost }, the longest a tab's call for
// them is held open until they change, and { alive }, as locks.js has it. `revisions`: how a form's
// revisions are given, { perPage }, as revisions.js has it. `deletable()`: whether a file in the
// source is a post, a term or an image library entry, by the site description in use, as
// deleted.js's deletableIn() tells it. `notFound`: the log of addresses not found, as not-found.js
// gives it, or null where there is none. `site()`: the site description in use, as checked, which
// the *Feeds* page chooses a feed's type and language from. `feeds`: the feed reader, as feeds.js
// gives it, or null. `purge`: how an Admin's purge waits, as purge.js has it.
export function editorsService({ forgejo, repository, token, rolesToken = null, pushesToken = null, control, pictures = null, store = null, forms = () => ({}), local = false, isPost = () => true, deletable = () => () => null, notFound = null, site = () => null, feeds = null, now = () => new Date(), warn = console.error, get = fetch, locks: { waitAtMost = 25_000, alive } = {}, revisions = {}, purge: purgeOptions = {} }) {
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

  // Who is asking, as Forgejo says: `admin`, one in the organisation's team of Admins;
  // `instanceAdministrator`, Kntnt's account on the instance, which is no Admin and may use the
  // Admin's pages all the same (ADR 0044); `writer`, anyone else who may write; or null. Who is in
  // a team Forgejo tells only those in it and the instance administrator, so the service asks by a
  // credential of its own that can read the teams and nothing else.
  const organisation = repository.split('/')[0];
  const asked = (path, credential) => get(`${forgejo}/api/v1${path}`, { headers: { authorization: credential } });
  const inAdmins = async (login) => rolesToken !== null && (await organisationTeams({ forgejo, organisation, token: rolesToken, get }).members(ADMINS_TEAM)).includes(login);
  const roleOf = async (credential) => {
    if (!CREDENTIAL.test(credential ?? '')) return null;
    const me = await asked('/user', credential);
    if (!me.ok) return null;
    const { login, is_admin: isInstanceAdministrator } = await me.json();
    if (isInstanceAdministrator === true) return 'instanceAdministrator';
    if (typeof login === 'string' && await inAdmins(login)) return 'admin';
    return await mayWrite({ forgejo, repository, credential, get }) ? 'writer' : null;
  };
  // Whether a role may use the Admin's pages, *Mail*, *Personal data*, *Consent records*,
  // *Addresses not found*, *Policy violations*, *Feeds* and *Purge a passage*, and an Admin's purge
  // from the *Deleted* page: an Admin's, and the instance administrator's; and whether the one
  // asking may, by their credential, or null for whoever may not write.
  const usesAdminPages = (role) => role === 'admin' || role === 'instanceAdministrator';
  const adminOf = async (credential) => {
    const role = await roleOf(credential);
    return role === null ? null : usesAdminPages(role);
  };
  // The Admin's pages that are modules of their own, each owning its paths: *Mail* (ADR 0003),
  // *Consent records* (ADR 0049), *Addresses not found* (ADR 0040), *Policy violations*
  // (ADR 0051) and *Feeds* (ADR 0079).
  const adminPages = [
    mailPage({ store, forms, local, adminOf, now }),
    consentRecordsPage({ store, adminOf, warn }),
    notFoundPage({ notFound, adminOf, forgejo, repository, token, get, warn }),
    violationsPage({ store, adminOf }),
    feedsPage({ store, feeds, site, record: () => control.record(), adminOf, now, warn }),
  ];

  // Who is asking, for the locks, which a tab asks about again and again: { login, name, admin },
  // `name` the account's full name, else its login, and `admin` whether its role saves an
  // Admin's forms, asked of Forgejo where a call needs it; or null for whoever may not write.
  // An answer holds a moment, as a small picture's does.
  const people = new Map();
  const personOf = async (credential) => {
    if (!CREDENTIAL.test(credential ?? '')) return null;
    const moment = now().getTime();
    const held = people.get(credential);
    if (held && moment - held.at < ANSWER_HOLDS) return held.person;
    let person = null;
    const me = await asked('/user', credential);
    if (me.ok && await mayWrite({ forgejo, repository, credential, get })) {
      const user = await me.json();
      const { login, is_admin: isInstanceAdministrator } = user;
      if (typeof login === 'string' && login !== '') {
        let admin;
        person = {
          login,
          name: accountName(user),
          admin: async () => (admin ??= isInstanceAdministrator === true || inAdmins(login)),
        };
      }
    }
    if (people.size >= ANSWERS_AT_MOST) people.clear();
    people.set(credential, { person, at: moment });
    return person;
  };

  // The forms of the posts made from a feed's item, which only the feed reader changes (ADR 0079):
  // `<collection>/<ID>`, as the lock names a form, a translation's its entry's.
  const feedForms = () => new Set((store?.feedPosts() ?? []).map(({ path }) => {
    const parts = path.split('/');
    return `${parts[0]}/${parts.at(-1).replace(/\.md$/, '')}`;
  }));

  // The locks of the editor's forms (ADR 0073). A tab asks for them all, and the call is held open
  // until they change or the wait is up, so that a tab whose form is taken over is told at once,
  // and each call says the tab answers. A form is held, or taken over, by PUT, and let go by
  // DELETE, each with the tab's name; a DELETE of them all ends the tab, as its page is closed.
  const table = lockTable({ now, ...(alive ? { alive } : {}) });
  // An Admin's purge (ADR 0078), which shuts the forms while it waits and runs, and is told to
  // every tab with the locks. Once it is done, the entry's addresses go from the counts of
  // addresses not found, and answer as any unknown address does (ADR 0040).
  const purge = purgeKeeper({ table, control, now, warn, ...purgeOptions, onDone: (addresses) => {
    history.purgesChanged();
    pictures?.forget?.();
    if (addresses.length > 0) notFound?.forget(addresses);
  } });
  const locksShown = (person, tab) => ({
    version: table.version,
    locks: table.list().map((lock) => ({ form: lock.form, name: lock.name, since: lock.since.toISOString(), mine: lock.tab === tab, yours: lock.login === person.login })),
    purge: purge.forTab(tab),
  });
  const answerLocks = async (incoming, outgoing, below, searchParams) => {
    incoming.resume();
    const methods = below === '' ? ['GET', 'DELETE'] : ['PUT', 'DELETE'];
    if (!methods.includes(incoming.method)) return answerMethods(incoming, outgoing, methods);
    const person = await personOf(incoming.headers.authorization);
    if (person === null) return answerJson(outgoing, 401, {});
    const tab = searchParams.get('tab');
    if (!isTab(tab)) return answerJson(outgoing, 400, {});
    if (below === '' && incoming.method === 'DELETE') {
      table.end(tab);
      outgoing.writeHead(204, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      return outgoing.end();
    }
    table.touch(tab);
    if (below === '') {
      const after = searchParams.get('after');
      if (after !== String(table.version)) return answerJson(outgoing, 200, locksShown(person, tab));
      let done = false;
      let stop;
      const answer = () => {
        if (done) return;
        done = true;
        stop();
        clearTimeout(timer);
        table.touch(tab);
        if (!outgoing.destroyed) answerJson(outgoing, 200, locksShown(person, tab));
      };
      stop = table.onChange(answer);
      const timer = setTimeout(answer, waitAtMost);
      outgoing.on('close', answer);
      return undefined;
    }
    let form;
    try {
      form = decodeURIComponent(below.slice(1));
    } catch {
      return answerJson(outgoing, 400, {});
    }
    if (!isForm(form)) return answerJson(outgoing, 400, {});
    if (incoming.method === 'DELETE') {
      table.release(form, tab);
      outgoing.writeHead(204, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      return outgoing.end();
    }
    if (isAdminsForm(form) && !await person.admin()) return answerJson(outgoing, 403, { adminOnly: true });
    if (feedForms().has(form)) return answerJson(outgoing, 403, { fromFeed: true });
    const result = table.hold(form, person, tab, searchParams.get('takeOver') === 'true');
    if (result.ended) return answerJson(outgoing, 410, {});
    if (result.shut) return answerJson(outgoing, 423, { purge: purge.forTab(tab) });
    if (result.held) return answerJson(outgoing, 200, { held: true, since: result.held.since.toISOString() });
    const { name, login, since } = result.holder;
    return answerJson(outgoing, 409, { holder: { name, since: since.toISOString(), yours: login === person.login } });
  };

  // A form's revisions (ADR 0074), to whoever may write, who may open the form: each commit that
  // changed its file, a page at a time, newest first, with the file as the commit left it.
  const history = sourceHistory({ forgejo, repository, token, pushesToken: pushesToken ?? token, get, ...revisions });
  const answerRevisions = async (incoming, outgoing, searchParams) => {
    incoming.resume();
    if (incoming.method !== 'GET') return answerMethods(incoming, outgoing, ['GET']);
    if (await personOf(incoming.headers.authorization) === null) return answerJson(outgoing, 401, {});
    const path = searchParams.get('path');
    const page = Number(searchParams.get('page') ?? '1');
    if (!isSourcePath(path) || !Number.isInteger(page) || page < 1) return answerJson(outgoing, 400, {});
    try {
      return answerJson(outgoing, 200, await history.revisions(path, { page }));
    } catch (error) {
      warn(`The revisions of ${path} could not be read: ${error.message}`);
      return answerJson(outgoing, 502, {});
    }
  };

  // The deleted posts, terms and image library entries (ADR 0077), to whoever may write, who may
  // open their forms: a page at a time, newest deletion first, of one collection where it is named.
  const answerDeleted = async (incoming, outgoing, searchParams) => {
    incoming.resume();
    if (incoming.method !== 'GET') return answerMethods(incoming, outgoing, ['GET']);
    if (await personOf(incoming.headers.authorization) === null) return answerJson(outgoing, 401, {});
    const page = Number(searchParams.get('page') ?? '1');
    const collection = searchParams.get('collection');
    if (!Number.isInteger(page) || page < 1 || (collection !== null && !/^[\w-]{1,64}$/.test(collection))) return answerJson(outgoing, 400, {});
    try {
      return answerJson(outgoing, 200, await history.deleted({ page, collection, deletable: deletable() }));
    } catch (error) {
      warn(`The deleted entries could not be read: ${error.message}`);
      return answerJson(outgoing, 502, {});
    }
  };

  // An Admin's purge (ADR 0078), to an Admin alone: how it stands, who has which form open, and
  // the purges made before, who and when; asked for by a deleted entry's path, or by a passage,
  // and the course to take with the forms open, `anyway` or `wait`; and one that waits stopped.
  const answerPurge = async (incoming, outgoing) => {
    if (!['GET', 'POST', 'DELETE'].includes(incoming.method)) return answerMethods(incoming, outgoing, ['GET', 'POST', 'DELETE']);
    if (!await asAdmin(incoming, outgoing, adminOf)) return undefined;
    if (incoming.method === 'GET') {
      incoming.resume();
      let purges = [];
      try {
        ({ purges } = await history.purges());
      } catch (error) {
        warn(`The record of purges could not be read: ${error.message}`);
      }
      return answerJson(outgoing, 200, { purge: purge.forAdmin(), purges, open: purge.formsOpen() });
    }
    if (incoming.method === 'DELETE') {
      incoming.resume();
      return purge.cancel() ? answerJson(outgoing, 200, { purge: purge.forAdmin() }) : answerJson(outgoing, 409, { purge: purge.forAdmin() });
    }
    const given = await jsonOf(incoming, outgoing, PURGE_LIMIT);
    if (given === undefined) return undefined;
    if (!['anyway', 'wait'].includes(given?.course)) return answerJson(outgoing, 400, {});
    const ofPassage = given.passage !== undefined;
    const passage = ofPassage ? passageOf(given.passage) : null;
    if (ofPassage ? passage === null || given.path !== undefined : !isSourcePath(given.path)) return answerJson(outgoing, 400, {});
    const person = await personOf(incoming.headers.authorization);
    if (person === null) return answerJson(outgoing, 401, {});
    let entry = null;
    if (!ofPassage) {
      try {
        entry = await history.deletedOne(given.path, deletable());
      } catch (error) {
        warn(`The deleted entries could not be read: ${error.message}`);
        return answerJson(outgoing, 502, {});
      }
      if (entry === null) return answerJson(outgoing, 404, {});
    }
    const started = purge.start({ entry, passage, by: { login: person.login, name: person.name }, course: given.course });
    if (started.busy) return answerJson(outgoing, 409, { purge: purge.forAdmin() });
    return answerJson(outgoing, 202, started);
  };

  // An Admin's search for a passage before its purge (ADR 0078), to an Admin alone: every file and
  // revision of the source that holds it, as the purge's program finds them. The passage comes in
  // the request's body, never its address, which logs may keep.
  const answerSearch = async (incoming, outgoing) => {
    if (incoming.method !== 'POST') return answerMethods(incoming, outgoing, ['POST']);
    if (!await asAdmin(incoming, outgoing, adminOf)) return undefined;
    const given = await jsonOf(incoming, outgoing, PURGE_LIMIT);
    if (given === undefined) return undefined;
    const passage = passageOf(given?.passage);
    if (passage === null) return answerJson(outgoing, 400, {});
    const answer = await purge.search(passage);
    if (answer.failed) return answerJson(outgoing, 502, {});
    if (answer.busy) return answerJson(outgoing, 503, {});
    return answerJson(outgoing, 200, { found: answer.found });
  };

  // A person's submissions (ADR 0045), to an Admin alone, as privacy law asks: those that hold what
  // the Admin searches by, in every form, spam among them, each with its form's label; those the
  // Admin chooses as CSV, by the separator, in the time zone and in the interface language the
  // reader names; and those the Admin chooses erased. An Editor is told only that it is an
  // Admin's, and whoever may not write nothing.
  const answerPersonalData = async (incoming, outgoing, asCsv, searchParams) => {
    incoming.resume();
    const methods = asCsv ? ['GET'] : ['GET', 'DELETE'];
    if (!methods.includes(incoming.method)) return answerMethods(incoming, outgoing, methods);
    if (!store) return answerJson(outgoing, 404, {});
    if (!await asAdmin(incoming, outgoing, adminOf)) return undefined;
    const declared = forms();
    const labelOf = (form) => declared[form]?.label ?? form;
    if (incoming.method === 'GET' && !asCsv) {
      const text = soughtOf(searchParams.get('text'));
      if (text === null) return answerJson(outgoing, 400, {});
      const { submissions, more } = findSubmissions(store, text);
      return answerJson(outgoing, 200, {
        submissions: submissions.map(({ id, form, sentAt, language, spam, fields }) => ({ id, form, label: labelOf(form), sentAt, language, spam: spam !== null, fields })),
        more,
      });
    }
    const ids = idsOf(searchParams.get('ids'));
    if (ids === null) return answerJson(outgoing, 400, {});
    if (incoming.method === 'DELETE') return answerJson(outgoing, 200, { erased: store.erase(ids) });
    const separator = searchParams.get('separator');
    if (!Object.hasOwn(SEPARATORS, separator ?? '')) return answerJson(outgoing, 400, {});
    const chosen = store.chosen(ids);
    return answerCsv(outgoing, 'personal-data', submissionsCsv({
      labelOf,
      each: () => chosen,
      separator,
      timeZone: timeZoneOf(searchParams.get('timeZone')),
      language: searchParams.get('language'),
    }), warn);
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
          labelOf: () => declared[name]?.label ?? name,
          each: () => reading.each(),
          separator,
          timeZone: timeZoneOf(searchParams.get('timeZone')),
          language: searchParams.get('language'),
        }), warn);
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
        // Each incoming feed that could not be read, until a read succeeds, and each with a post the
        // build refused as the feed reader wrote it (ADR 0079).
        const refused = store ? refusedPosts({ store, record }) : new Map();
        const failing = (store?.feeds() ?? []).filter(({ id, failure }) => failure !== null || refused.has(id)).map(({ id, address, failure }) => ({ address, failure, refused: refused.get(id) ?? [] }));
        return answerJson(outgoing, 200, { posts, others: { refusals: record?.refusals ?? [], warnings: record?.warnings ?? [] }, feeds: failing, reason: record?.reason ?? null, at: record?.at ?? null });
      }
      if (pathname === '/_konzilo/thumbnail') return answerPicture(incoming, outgoing, searchParams.get('of'));
      if (pathname === SUBMISSIONS || pathname.startsWith(`${SUBMISSIONS}/`)) return answerSubmissions(incoming, outgoing, pathname.slice(SUBMISSIONS.length), searchParams);
      if (pathname === PERSONAL_DATA || pathname === `${PERSONAL_DATA}.csv`) return answerPersonalData(incoming, outgoing, pathname.endsWith('.csv'), searchParams);
      if (pathname === LOCKS || pathname.startsWith(`${LOCKS}/`)) return answerLocks(incoming, outgoing, pathname.slice(LOCKS.length), searchParams);
      if (pathname === REVISIONS) return answerRevisions(incoming, outgoing, searchParams);
      if (pathname === DELETED) return answerDeleted(incoming, outgoing, searchParams);
      if (pathname === PURGE) return answerPurge(incoming, outgoing);
      if (pathname === PURGE_SEARCH) return answerSearch(incoming, outgoing);
      const page = adminPages.find((one) => one.owns(pathname));
      if (page) return page.answer(incoming, outgoing, pathname, searchParams);
      return answerJson(outgoing, 404, {});
    },

    // Lets go every lock whose tab has stopped answering, which the program asks for often.
    sweepLocks: () => table.sweep(),

    // Takes an Admin's purge on where it can go, which the program asks for each second.
    purgeStep: () => purge.step(),

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
