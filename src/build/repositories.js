// The two repositories a build works with: the source repository, read as a whole, since who
// last changed a file takes its history (ADR 0027), and the content repository, which holds
// the published files, is written by the build alone, and lies where the site's build reads
// them. A checkout is derived: lost, it comes back from Forgejo.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { gitEnvironment } from '../forgejo.js';
import { POST_IDS_FILE } from '../format/write.js';

const run = promisify(execFile);
const BIG = 1024 * 1024 * 256;
const IDENTITY = ['-c', 'user.name=Konzilo', '-c', 'user.email=konzilo@localhost.invalid'];

function gitIn(folder, access, command) {
  const environment = gitEnvironment(access);
  return async (...args) => (await command('git', args, { cwd: folder, env: environment, maxBuffer: BIG })).stdout;
}

const asNew = async (folder, remote, git) => {
  mkdirSync(folder, { recursive: true });
  await git('init', '--quiet', '--initial-branch=main');
  await git('remote', 'add', 'origin', remote);
};

export function sourceRepository({ remote, folder, access, command = run }) {
  const git = gitIn(folder, access, command);
  return {
    folder,
    // Brings the checkout to what stands in the repository, and gives its commit.
    async refresh() {
      if (!existsSync(join(folder, '.git'))) {
        await asNew(folder, remote, git);
        await git('lfs', 'install', '--local', '--skip-repo');
      }
      await git('fetch', '--quiet', '--force', 'origin', 'main');
      await git('reset', '--quiet', '--hard', 'FETCH_HEAD');
      return (await git('rev-parse', 'HEAD')).trim();
    },
    // Each file's version: Git's name for what it holds, as Forgejo's tree of it also gives it.
    async versions() {
      const listed = await git('ls-tree', '-r', '-z', 'HEAD');
      return Object.fromEntries(listed.split('\0').filter(Boolean).map((line) => {
        const [about, path] = line.split('\t');
        return [path, about.split(' ')[2]];
      }));
    },
    // The commits a push brought, of those this checkout has: none of another branch's.
    async commitsOf(after, before) {
      try {
        const listed = await git('rev-list', after, ...(before ? [`^${before}`] : []));
        return listed.split('\n').filter(Boolean);
      } catch {
        return [];
      }
    },
  };
}

export function contentRepository({ remote, folder, access, command = run }) {
  const git = gitIn(folder, access, command);
  return {
    folder,
    // A folder with no history is what something else left there, as a developer's copy of
    // the demo content: this build's files are what a site publishes.
    async prepare() {
      if (existsSync(join(folder, '.git'))) return;
      rmSync(folder, { recursive: true, force: true });
      await asNew(folder, remote, git);
      if ((await git('ls-remote', '--heads', 'origin', 'main')).trim() === '') return;
      await git('fetch', '--quiet', 'origin', 'main');
      await git('reset', '--quiet', '--hard', 'FETCH_HEAD');
    },
    // Commits what the intake wrote, when it changed anything, and gives what names what a
    // site is built from, which leaves out the ledger: a source file saved otherwise changes
    // that and nothing a visitor can see.
    async commit(message) {
      await git('add', '--all');
      if ((await git('status', '--porcelain')).trim() !== '') await git(...IDENTITY, 'commit', '--quiet', '--message', message);
      const listed = await git('ls-tree', '-r', 'HEAD');
      return createHash('sha256').update(listed.split('\n').filter((line) => !line.endsWith(`\t${POST_IDS_FILE}`)).join('\n')).digest('hex');
    },
    push: () => git('push', '--quiet', 'origin', 'main'),
  };
}
