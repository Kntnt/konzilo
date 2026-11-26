// One build (ADR 0031): the source as it stands, through the intake, committed in the content
// repository, through Astro and made what visitors get, and then recorded, so that nothing says
// live before visitors have it. There is one builder per site and it does one thing at a time,
// so it needs no lock. Nothing is built again for the same content, code and origin.

import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { STOPPED } from '../intake/guard.js';
import { failure } from '../intake/words.js';
import { commandWithin, TookTooLong } from './command.js';
import { markdownMarks, webRules } from './web-server.js';

const STOPPED_BY_GUARD = 3;

// Why a build made no release, by its name, which the publish status shows in the interface
// language, and in British English, which the build log writes.
export const NOT_READ = failure('failure.not-read');
export const CHECK_BROKE = failure('failure.check-broke');
export const NOT_BUILT = failure('failure.not-built');
export const NOT_RELEASED = failure('failure.not-released');
export const TOOK_TOO_LONG = failure('failure.took-too-long');

// What a run of the intake reported of each post, with each post's version and what it was
// refused for or warned of, by name and values, and in British English.
function postsFrom(report, versions) {
  const about = (list, file) => list.filter((one) => one.file === file).map(({ field = null, block = null, line = null, name, values, reason, message }) => ({ field, block, line, ...(name ? { name, values } : {}), reason, message }));
  return Object.fromEntries((report?.posts ?? []).map((post) => [post.file, {
    id: post.id,
    type: post.type,
    title: post.title,
    state: post.state,
    at: post.at,
    // A scheduled post's triggers and its terms, which the editor's check at Save looks for a
    // cycle among (ADR 0076).
    ...(post.triggers ? { triggers: post.triggers, terms: post.terms ?? [] } : {}),
    address: post.address,
    shown: post.shown,
    version: versions[post.file],
    refusals: about(report.refusals, post.file),
    warnings: about(report.warnings, post.file),
  }]));
}

const heldBy = (posts) => Object.fromEntries(Object.entries(posts).filter(([, { state }]) => state === 'live').map(([file, { version }]) => [file, version]));

// `site`: the site's name. `origin`: its public host's. `code`: what names its code as it stands.
// `source`, `content`: as repositories.js gives them. `roles`: as roles.js gives it. `control`:
// as record.js gives it. `live`: as release.js gives it. `intake(checkout, roles, confirmed)` gives
// { status, report, detail } and `astro()` the folder it built into, or throws; either rejects
// with TookTooLong (command.js) where its command had not ended within the builder's time limit.
// `index()` makes the site's search index of the release in use (search-index.js), or throws.
//
// A build whose intake or site's build took too long runs once more from the start, since what
// holds a command up, Node's deadlock as it exits (nodejs/node#67596), comes by chance; its line in
// the build log says why. One that takes too long again fails, with a reason of its own, and the
// release in use stays. A build that fails otherwise is not tried again.
export function siteBuild({ site, origin, code, source, content, roles, control, live, intake, astro, index = async () => {}, now = () => new Date(), warn = console.error }) {
  const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  // The content repository is a copy here until this has worked. A push that fails goes with
  // the next one, and costs visitors nothing.
  const pushing = async () => {
    try {
      await content.push();
    } catch (error) {
      warn(`The content repository could not be pushed: ${error.message}`);
    }
  };

  // The search index (ADR 0053), made once `current` is switched, and at this builder's first build,
  // since nothing says whether an index of the release in use was kept. One that cannot be made
  // costs visitors nothing but search: the release stays live, the build's line says
  // `unindexed`, and the next build makes it, of the same release too.
  // What an intake that was stopped may have written in part, undone, so that the next try reads
  // the content repository as its last commit left it.
  const undoing = async () => {
    try {
      await content.undo();
    } catch (error) {
      warn(`What the stopped intake wrote could not be undone: ${error.message}`);
    }
  };

  let indexed = false;
  const indexing = async () => {
    try {
      await index();
      indexed = true;
      return false;
    } catch (error) {
      warn(`The search index could not be made: ${error.message}`);
      return true;
    }
  };

  // One try of a build. `confirmed()`: the code of a deletion an operator has confirmed, taken
  // once for the build, whichever try reads it. `retried`: why the try before was stopped, or
  // null for the first. Gives the build's record, or, where a command of the first try took too
  // long, why, as TookTooLong.
  const attempt = async ({ confirmed, retried }) => {
    const previous = control.record();
    const started = now();
    const stoppedBy = (error, finishing) => {
      if (!retried) return error;
      warn(`A command of the build took too long again, so the build failed: ${error.message}`);
      return finishing();
    };
    // A build whose intake reported nothing keeps what the last build read of each post, and
    // `read`, the version of each file it read itself, which its reason fails (status.js).
    const finish = ({ source: read = previous?.source ?? null, reason = null, stopped = null, report = null, versions = {}, release = previous?.release ?? null, unindexed = false }) => {
      const posts = report ? postsFrom(report, versions) : previous?.posts ?? {};
      const refusals = report?.refusals ?? previous?.refusals ?? [];
      const record = {
        source: read,
        at: now().toISOString(),
        outcome: reason === null && refusals.length === 0 ? 'live' : 'failed',
        reason,
        stopped,
        next: report ? report.next ?? null : previous?.next ?? null,
        release,
        ...(report === null && Object.keys(versions).length > 0 ? { read: versions } : {}),
        posts,
        refusals: refusals.filter(({ post }) => !post),
        warnings: (report?.warnings ?? previous?.warnings ?? []).filter(({ post }) => !post),
      };
      control.writeRecord(record);
      control.log({
        at: record.at,
        site,
        outcome: record.outcome,
        failures: [...(reason ? [reason] : []), ...refusals],
        ...(unindexed ? { unindexed: true } : {}),
        ...(retried ? { retried: retried.message } : {}),
      });
      return record;
    };

    let head;
    try {
      head = await source.refresh();
    } catch (error) {
      warn(`The build could not read the source: ${error.message}`);
      return finish({ reason: NOT_READ });
    }

    let versions;
    let report;
    try {
      versions = await source.versions();
      const awaited = await source.commitsOf(head, previous?.source ?? null);
      await content.prepare();
      const held = await roles.read({ source, awaited });
      const ran = await intake(source.folder, held, confirmed());
      report = ran.report;
      if (ran.status === STOPPED_BY_GUARD) {
        warn(`The deletion guard stopped the build: ${report.stopped.count} of ${report.stopped.total} posts would go, code ${report.stopped.code}`);
        return finish({ source: head, reason: STOPPED, stopped: report.stopped, report, versions });
      }
      if (ran.status !== 0) throw new Error(ran.detail);
    } catch (error) {
      if (error instanceof TookTooLong) {
        await undoing();
        return stoppedBy(error, () => finish({ source: head, reason: TOOK_TOO_LONG, versions }));
      }
      warn(`The check broke: ${error.message}`);
      return finish({ source: head, reason: CHECK_BROKE, versions });
    }

    let fingerprint;
    try {
      fingerprint = { content: await content.commit(`Publish ${head.slice(0, 12)}`), code, origin };
      const same = previous?.release && live.current() === previous.release.name && JSON.stringify(previous.release.fingerprint) === JSON.stringify(fingerprint);
      if (same) {
        const unindexed = indexed ? false : await indexing();
        await pushing();
        return finish({ source: head, report, versions, release: { ...previous.release, held: heldBy(postsFrom(report, versions)) }, unindexed });
      }
    } catch (error) {
      warn(`The build could not commit the content: ${error.message}`);
      return finish({ source: head, reason: CHECK_BROKE, report, versions });
    }

    let built;
    try {
      built = await astro();
    } catch (error) {
      if (error instanceof TookTooLong) return stoppedBy(error, () => finish({ source: head, reason: TOOK_TOO_LONG, report, versions }));
      warn(`Astro could not build the site: ${error.stderr ?? error.message}`);
      return finish({ source: head, reason: NOT_BUILT, report, versions });
    }

    const name = `${stamp(started)}-${head.slice(0, 12)}`;
    try {
      const given = (file) => (existsSync(join(built, file)) ? readFileSync(join(built, file), 'utf8') : '');
      const holds = (path) => statSync(join(built, path), { throwIfNoEntry: false })?.isFile() === true;
      const marks = markdownMarks(given('_markdown'), holds);
      live.publish(built, name, webRules({ headers: given('_headers'), redirects: given('_redirects'), origin }), marks);
    } catch (error) {
      warn(`The release could not be put in place: ${error.message}`);
      return finish({ source: head, reason: NOT_RELEASED, report, versions });
    }

    const unindexed = await indexing();
    await pushing();
    return finish({ source: head, report, versions, release: { name, at: now().toISOString(), fingerprint, held: heldBy(postsFrom(report, versions)) }, unindexed });
  };

  return async function build() {
    let code;
    const confirmed = () => {
      if (code === undefined) code = control.takeConfirmed();
      return code;
    };
    const tried = await attempt({ confirmed, retried: null });
    if (!(tried instanceof TookTooLong)) return tried;
    warn(`A command of the build took too long, so the build runs once more from the start: ${tried.message}`);
    return attempt({ confirmed, retried: tried });
  };
}

// The intake as a program of its own, so that it can break without taking the builder along.
// `limit`: how long it may take, in milliseconds (src/arrangement.js); one still running then is
// stopped, and the function rejects with TookTooLong.
export function intakeCommand({ program, siteFolder, contentFolder, environment, limit }) {
  const command = commandWithin(limit);
  return async (checkout, { admins, reviewers, pushers }, confirmed) => {
    const args = [program, checkout, '--admins', admins, '--reviewers', reviewers, '--pushers', pushers, '--site', siteFolder, '--content', contentFolder, ...(confirmed ? ['--confirm', confirmed] : [])];
    try {
      const { stdout } = await command(process.execPath, args, { env: environment });
      return { status: 0, report: JSON.parse(stdout) };
    } catch (error) {
      if (error instanceof TookTooLong) throw error;
      if (error.code === STOPPED_BY_GUARD) return { status: STOPPED_BY_GUARD, report: JSON.parse(error.stdout) };
      return { status: error.code ?? 1, detail: error.stderr ?? error.message };
    }
  };
}

// The site's own build, with nothing of the builder's credentials in its environment. It gives
// the folder it wrote the pages into, which it clears first, so that pages a build left behind,
// one that was stopped among them, are never taken for this one's. `limit`: how long it may take,
// in milliseconds; one still running then is stopped, and the function rejects with TookTooLong.
export function astroBuild({ folder, environment, limit, built = `${folder}/dist` }) {
  const command = commandWithin(limit);
  return async () => {
    rmSync(built, { recursive: true, force: true });
    await command('npm', ['run', 'build', '--silent'], { cwd: folder, env: environment });
    if (!existsSync(built)) throw new Error(`no pages in ${built}`);
    return built;
  };
}
