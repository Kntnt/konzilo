// Repositories that stand in for Forgejo's in the tests of a purge (ADR 0078): one saved to commit
// by commit, a clone of it as the purge makes one, and one cloned anew, as anyone would from
// Forgejo after the purge, with what every commit of it holds.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after } from 'node:test';

import { gitIn } from '../../src/purge/rewrite.js';

const folders = [];
after(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});
const newFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), 'konzilo-purge-'));
  folders.push(folder);
  return folder;
};
const environmentOf = (home) => ({ PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });

// A repository as Forgejo holds it, and a working copy that saves to it, commit by commit, each
// { files, message }, a file's text, or null for one removed, a minute after the last.
export function remote() {
  const home = newFolder();
  const bare = join(home, 'remote.git');
  const work = join(home, 'work');
  const environment = environmentOf(home);
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', bare], { env: environment });
  execFileSync('git', ['clone', '--quiet', bare, work], { env: environment, stdio: 'ignore' });
  const git = (...args) => execFileSync('git', args, { cwd: work, env: environment, encoding: 'utf8' }).trim();
  git('checkout', '--quiet', '-B', 'main');
  let count = 0;
  const save = ({ files, message = `Save ${count + 1}` }) => {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) {
        git('rm', '--quiet', '--', path);
        continue;
      }
      mkdirSync(dirname(join(work, path)), { recursive: true });
      writeFileSync(join(work, path), text);
      git('add', '--', path);
    }
    const moment = new Date(Date.UTC(2026, 10, 1, 8, count)).toISOString();
    count += 1;
    execFileSync('git', ['-c', 'user.name=Someone', '-c', 'user.email=someone@localhost.invalid', 'commit', '--quiet', '--allow-empty', '--message', message], {
      cwd: work,
      env: { ...environment, GIT_AUTHOR_DATE: moment, GIT_COMMITTER_DATE: moment },
    });
    git('push', '--quiet', 'origin', 'main');
    return git('rev-parse', 'HEAD');
  };
  return { bare, save, git };
}

// A clone of a repository as the purge makes one, bare, with every branch.
export function cloneOf(bare) {
  const folder = join(newFolder(), 'clone.git');
  const environment = environmentOf(dirname(folder));
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', folder], { env: environment });
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: folder, env: environment });
  return { git: gitIn(folder, environment) };
}

// A fresh clone of a repository, as one cloned anew from Forgejo, with everything it holds.
export function cloned(bare) {
  const folder = join(newFolder(), 'fresh');
  const environment = environmentOf(dirname(folder));
  execFileSync('git', ['clone', '--quiet', '--mirror', bare, folder], { env: environment });
  return (...args) => execFileSync('git', args, { cwd: folder, env: environment, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
}

// Every path any commit of any branch holds, and every blob's text.
export const everyPath = (git) => new Set(git('log', '--all', '--format=', '--name-only').split('\n').filter(Boolean));
export const everyText = (git) => git('rev-list', '--all', '--objects').split('\n').map((line) => line.split(' ')[0]).filter((sha) => git('cat-file', '-t', sha) === 'blob').map((sha) => git('cat-file', 'blob', sha));
export const fileAt = (git, commit, path) => {
  try {
    return git('show', `${commit}:${path}`);
  } catch {
    return null;
  }
};
