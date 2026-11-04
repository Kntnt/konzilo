// The source repository as the preview reads it: a checkout outside the site's root, so that
// its dev server has no way to it, made and brought up to date with Git and Git LFS, with a
// credential that can only read and is never written to disk by Git (ADR 0032).

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';

import { gitEnvironment } from '../forgejo.js';
import { walk } from '../intake/content-folder.js';

const run = promisify(execFile);

// How long a checkout counts as up to date: a draft's run asks often, and a save seldom
// matters within this time, as the draft itself holds what the editor sees.
const FRESH = 10_000;

// `remote`: the repository's address. `user` and `token`: a reader's. `folder`: where
// the checkout lies. `home`: Git's home. A Forgejo that does not answer costs a preview that
// has a checkout nothing: it shows what it has, and asks again next time.
export function gitSource({ remote, user, token, folder, home, now = Date.now, command = run, warn = console.error }) {
  const environment = gitEnvironment({ user, token, home });
  const git = (...args) => command('git', args, { cwd: folder, env: environment, maxBuffer: 1024 * 1024 * 64 });
  let asked = -Infinity;
  let head = null;

  return {
    async refresh() {
      if (now() - asked < FRESH) return;
      if (!existsSync(join(folder, '.git'))) {
        mkdirSync(folder, { recursive: true });
        mkdirSync(home, { recursive: true });
        await git('init', '--quiet', '--initial-branch=main');
        await git('remote', 'add', 'origin', remote);
        await git('lfs', 'install', '--local', '--skip-repo');
      }
      try {
        await git('fetch', '--quiet', '--depth=1', 'origin', 'main');
        await git('reset', '--quiet', '--hard', 'FETCH_HEAD');
        head = (await git('rev-parse', 'HEAD')).stdout.trim();
        asked = now();
      } catch (error) {
        if (head === null) throw error;
        warn(`The preview could not bring its source up to date: ${error.message}`);
      }
    },
    head: () => head,
    files: () => walk(folder).map((path) => relative(folder, path)).filter((path) => !path.startsWith('media/')).map((path) => ({ path, contents: readFileSync(join(folder, path), 'utf8') })),
    originals: () => walk(folder).map((path) => relative(folder, path)).filter((path) => path.startsWith('media/')).map((path) => ({ path, contents: () => readFileSync(join(folder, path)) })),
  };
}
