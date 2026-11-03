// The source repository as the preview reads it: a checkout outside the site's root, so that
// its dev server has no way to it, made and brought up to date with Git and Git LFS, with a
// credential that can only read and is never written to disk by Git (ADR 0032).

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';

import { walk } from '../intake/content-folder.js';

const run = promisify(execFile);

// How long a checkout counts as up to date: a draft's run asks often, and a save seldom
// matters within this time, as the draft itself holds what the editor sees.
const FRESH = 10_000;

// `remote`: the repository's address. `user` and `token`: a reader's. `folder`: where
// the checkout lies. `home`: Git's home.
export function gitSource({ remote, user, token, folder, home, now = Date.now }) {
  const environment = {
    PATH: process.env.PATH,
    HOME: home,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`,
  };
  const git = (...args) => run('git', args, { cwd: folder, env: environment, maxBuffer: 1024 * 1024 * 64 });
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
      await git('fetch', '--quiet', '--depth=1', 'origin', 'main');
      await git('reset', '--quiet', '--hard', 'FETCH_HEAD');
      head = (await git('rev-parse', 'HEAD')).stdout.trim();
      asked = now();
    },
    head: () => head,
    files: () => walk(folder).map((path) => relative(folder, path)).filter((path) => !path.startsWith('media/')).map((path) => ({ path, contents: readFileSync(join(folder, path), 'utf8') })),
    originals: () => walk(folder).map((path) => relative(folder, path)).filter((path) => path.startsWith('media/')).map((path) => ({ path, contents: () => readFileSync(join(folder, path)) })),
  };
}
