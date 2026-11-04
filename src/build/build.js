// One build (ADR 0031): the source as it stands, through the intake, committed in the content
// repository, through Astro and made what visitors get, and then recorded, so that nothing says
// live before visitors have it. There is one builder per site and it does one thing at a time,
// so it needs no lock. Nothing is built again for the same content, code and origin.

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { STOPPED } from '../intake/guard.js';
import { webRules } from './web-server.js';

const run = promisify(execFile);
const BIG = 1024 * 1024 * 256;
const STOPPED_BY_GUARD = 3;

export const NOT_READ = 'the source could not be read, so visitors still see the last version';
export const CHECK_BROKE = 'the check of what was saved broke, so visitors still see the last version';
export const NOT_BUILT = 'the site could not be built from it, so visitors still see the last version';
export const NOT_RELEASED = 'the new version of the site could not be put in place, so visitors still see the last version';

// What a run of the intake reported of each post, with each post's version and what it was
// refused for or warned of.
function postsFrom(report, versions) {
  const about = (list, file) => list.filter((one) => one.file === file).map(({ field = null, block = null, line = null, reason, message }) => ({ field, block, line, reason, message }));
  return Object.fromEntries((report?.posts ?? []).map((post) => [post.file, {
    id: post.id,
    type: post.type,
    title: post.title,
    state: post.state,
    at: post.at,
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
// { status, report, detail } and `astro()` the folder it built into, or throws.
export function siteBuild({ site, origin, code, source, content, roles, control, live, intake, astro, now = () => new Date(), warn = console.error }) {
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

  return async function build() {
    const previous = control.record();
    const started = now();
    const finish = ({ source: read = previous?.source ?? null, reason = null, stopped = null, report = null, versions = {}, release = previous?.release ?? null }) => {
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
        posts,
        refusals: refusals.filter(({ post }) => !post),
        warnings: (report?.warnings ?? previous?.warnings ?? []).filter(({ post }) => !post),
      };
      control.writeRecord(record);
      control.log({
        at: record.at,
        site,
        outcome: record.outcome,
        failures: [...(reason ? [{ reason }] : []), ...refusals],
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
      const confirmed = control.takeConfirmed();
      const ran = await intake(source.folder, held, confirmed);
      report = ran.report;
      if (ran.status === STOPPED_BY_GUARD) {
        warn(`The deletion guard stopped the build: ${report.stopped.count} of ${report.stopped.total} posts would go, code ${report.stopped.code}`);
        return finish({ source: head, reason: STOPPED, stopped: report.stopped, report, versions });
      }
      if (ran.status !== 0) throw new Error(ran.detail);
    } catch (error) {
      warn(`The check broke: ${error.message}`);
      return finish({ source: head, reason: CHECK_BROKE });
    }

    let fingerprint;
    try {
      fingerprint = { content: await content.commit(`Publish ${head.slice(0, 12)}`), code, origin };
      const same = previous?.release && live.current() === previous.release.name && JSON.stringify(previous.release.fingerprint) === JSON.stringify(fingerprint);
      if (same) {
        await pushing();
        return finish({ source: head, report, versions, release: { ...previous.release, held: heldBy(postsFrom(report, versions)) } });
      }
    } catch (error) {
      warn(`The build could not commit the content: ${error.message}`);
      return finish({ source: head, reason: CHECK_BROKE, report, versions });
    }

    let built;
    try {
      built = await astro();
    } catch (error) {
      warn(`Astro could not build the site: ${error.stderr ?? error.message}`);
      return finish({ source: head, reason: NOT_BUILT, report, versions });
    }

    const name = `${stamp(started)}-${head.slice(0, 12)}`;
    try {
      const given = (file) => (existsSync(join(built, file)) ? readFileSync(join(built, file), 'utf8') : '');
      live.publish(built, name, webRules({ headers: given('_headers'), redirects: given('_redirects') }));
    } catch (error) {
      warn(`The release could not be put in place: ${error.message}`);
      return finish({ source: head, reason: NOT_RELEASED, report, versions });
    }

    await pushing();
    return finish({ source: head, report, versions, release: { name, at: now().toISOString(), fingerprint, held: heldBy(postsFrom(report, versions)) } });
  };
}

// The intake as a program of its own, so that it can break without taking the builder along.
export function intakeCommand({ program, siteFolder, contentFolder, environment, command = run }) {
  return async (checkout, { admins, pushers }, confirmed) => {
    const args = [program, checkout, '--admins', admins, '--pushers', pushers, '--site', siteFolder, '--content', contentFolder, ...(confirmed ? ['--confirm', confirmed] : [])];
    try {
      const { stdout } = await command(process.execPath, args, { env: environment, maxBuffer: BIG });
      return { status: 0, report: JSON.parse(stdout) };
    } catch (error) {
      if (error.code === STOPPED_BY_GUARD) return { status: STOPPED_BY_GUARD, report: JSON.parse(error.stdout) };
      return { status: error.code ?? 1, detail: error.stderr ?? error.message };
    }
  };
}

// The site's own build, with nothing of the builder's credentials in its environment. It gives
// the folder it wrote the pages into.
export function astroBuild({ folder, environment, built = `${folder}/dist`, command = run }) {
  return async () => {
    await command('npm', ['run', 'build', '--silent'], { cwd: folder, env: environment, maxBuffer: BIG });
    if (!existsSync(built)) throw new Error(`no pages in ${built}`);
    return built;
  };
}
