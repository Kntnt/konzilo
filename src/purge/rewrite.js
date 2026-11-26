// A purge's rewrite of a branch's history (ADR 0078): every commit of the branch read by Git's
// fast-export, without the files' contents, and written again by its fast-import, with what is
// to go left out of each and what is to change changed, so that the same history comes back
// commit for commit, but for what was purged. A commit is written as it was, its author, its
// committer, their moments and its message, so that each one before the oldest that changes
// keeps its identity, and each one after it gets a new one. A commit that held nothing but what
// is purged is no longer a save of anything, and goes; a commit that was empty before stays.
//
// What to remove and what to change it is handed, so that a purge of an entry and the purge of a
// passage from every old revision (ADR 0078) rewrite alike:
//
// - `drop(path, at)`: whether a file a commit writes is to go from it, `at` being what the commit
//   was, { commit, message, read(path) }, `commit` its old identity, `message` its message, and
//   `read(path)` a file as it left it, or null. A file dropped where the commit before it holds it is removed there, as the commit
//   it was written over is no longer the file's.
// - `change(path, bytes)`: a file's new bytes, or null to keep it as it is. It is given the file
//   alone, so that each version of a file is changed once, however many commits hold it.
// - `reads(path, blob)`: whether `change` is to be given this version of a file at all, so that
//   one it would keep is not read; every one is, by default.
// - `message(text)`: a commit's new message, or null to keep it.
// - `keepEmpty`: whether a commit left with nothing it writes stays, as a save of nothing, rather
//   than go; one that was empty before always stays.
//
// It gives { head, renamed, gone }, `head` the branch's new commit, `renamed` a map from each old
// commit to the one that now stands in its place: itself, its new identity, or, for a commit that
// went, the one its parent became, or null for a first commit that went; and `gone`, the old
// commits that went.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Git in `folder`, with `environment`, as a purge runs it, its arguments in one array and what it
// is fed as `input`: run(args, { input }) gives what it wrote, as bytes, or throws with what it
// said.
export function gitRunner(folder, environment) {
  return (args, { input = null } = {}) => new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: folder, env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const said = [];
    child.stdout.on('data', (piece) => out.push(piece));
    child.stderr.on('data', (piece) => said.push(piece));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(Object.assign(new Error(`git ${args[0]}: ${Buffer.concat(said).toString('utf8').trim() || `exit ${code}`}`), { code }));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? undefined);
  });
}

// A path as fast-export writes it, read: C's quoting undone where it is quoted.
export function unquoted(written) {
  if (!written.startsWith('"')) return written;
  const bytes = [];
  const escapes = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '"': 34, '\\': 92 };
  const inner = Buffer.from(written.slice(1, -1), 'utf8');
  for (let at = 0; at < inner.length; at += 1) {
    if (inner[at] !== 92) {
      bytes.push(inner[at]);
      continue;
    }
    const next = String.fromCharCode(inner[at + 1]);
    if (/[0-7]/.test(next)) {
      bytes.push(Number.parseInt(inner.subarray(at + 1, at + 4).toString('latin1'), 8));
      at += 3;
    } else {
      bytes.push(escapes[next] ?? inner[at + 1]);
      at += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

// Git's name for a blob of these bytes.
const blobName = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

// The commands of a fast-export stream, one at a time: each { lines, data }, `lines` the command's
// own lines up to its data or its end, and `data` the bytes of its data, or null.
function* commandsOf(stream) {
  let at = 0;
  const line = () => {
    const end = stream.indexOf(10, at);
    const text = stream.subarray(at, end === -1 ? stream.length : end).toString('utf8');
    at = end === -1 ? stream.length : end + 1;
    return text;
  };
  while (at < stream.length) {
    const first = line();
    if (first === '') continue;
    if (!first.startsWith('commit ')) {
      yield { kind: 'other', lines: [first] };
      continue;
    }
    const head = [first];
    let message = null;
    for (;;) {
      const next = line();
      if (next.startsWith('data ')) {
        const length = Number(next.slice(5));
        message = stream.subarray(at, at + length);
        at += length;
        break;
      }
      head.push(next);
    }
    const rest = [];
    while (at < stream.length) {
      const save = at;
      const next = line();
      if (next === '') break;
      if (next.startsWith('commit ') || next.startsWith('reset ') || next === 'done') {
        at = save;
        break;
      }
      rest.push(next);
    }
    yield { kind: 'commit', head, message, rest };
  }
}

// `git`: as gitRunner() gives it, in the repository whose branch `branch` is rewritten in place.
export async function rewriteHistory({ git, branch = 'main', drop = () => false, change = () => null, reads = () => true, message = () => null, keepEmpty = false }) {
  const stream = await git(['-c', 'core.quotePath=false', 'fast-export', '--no-data', '--show-original-ids', '--signed-tags=strip', '--reencode=no', '--use-done-feature', `refs/heads/${branch}`]);

  // Each file a commit's rewritten tree holds otherwise than its old one did, by the commit's
  // mark: its new blob, or null where it no longer holds it. A commit takes its first parent's.
  const differs = new Map();
  // What each mark is: { commit, parent }, `parent` the mark or the identity of its first parent.
  const marks = new Map();
  // A mark that went, and what stands in its place.
  const instead = new Map();
  const changed = new Map();
  const read = new Map();

  const resolve = (ref) => {
    let at = ref;
    while (instead.has(at)) at = instead.get(at);
    return at;
  };
  const oldOf = (ref) => (ref.startsWith(':') ? marks.get(ref)?.commit ?? null : ref);
  const changedOf = (path, sha) => {
    const key = `${path}\0${sha}`;
    if (!changed.has(key)) {
      changed.set(key, (async () => {
        const bytes = await git(['cat-file', 'blob', sha]);
        const made = await change(path, bytes);
        return made === null || made === undefined ? null : Buffer.from(made);
      })());
    }
    return changed.get(key);
  };
  const atCommit = (commit, said) => ({
    commit,
    message: said,
    read: (path) => {
      const key = `${commit}:${path}`;
      if (!read.has(key)) read.set(key, git(['cat-file', 'blob', key]).catch(() => null));
      return read.get(key);
    },
  });
  // What a file is in a commit's parent as rewritten, `<mode> <blob>`, or null where it holds
  // none: what the commit holds otherwise, else what its old parent held.
  const parentValue = async (state, parent, path) => {
    if (state.has(path)) return state.get(path);
    const old = parent === null ? null : oldOf(parent);
    if (old === null) return null;
    const listed = (await git(['ls-tree', old, '--', path])).toString('utf8').trim();
    if (listed === '') return null;
    const [mode, , blob] = listed.split('\t')[0].split(' ');
    return `${mode} ${blob}`;
  };
  // A file of a commit as rewritten, against what the old commit held.
  const settle = (state, path, now, before) => {
    if (now === before) state.delete(path);
    else state.set(path, now);
  };

  const out = [];
  const write = (text) => out.push(Buffer.from(text, 'utf8'));
  for (const command of commandsOf(stream)) {
    if (command.kind === 'other') {
      const [text] = command.lines;
      if (text.startsWith('from ')) write(`from ${resolve(text.slice(5))}\n`);
      else write(`${text}\n`);
      continue;
    }
    const { head, rest } = command;
    const mark = head.find((one) => one.startsWith('mark '))?.slice(5) ?? null;
    const commit = head.find((one) => one.startsWith('original-oid '))?.slice(13) ?? null;
    const parents = rest.filter((one) => one.startsWith('from ') || one.startsWith('merge ')).map((one) => one.slice(one.indexOf(' ') + 1));
    const first = rest.find((one) => one.startsWith('from '))?.slice(5) ?? null;
    const at = atCommit(commit, command.message.toString('utf8'));
    // What this commit holds otherwise than its old self, which starts as its first parent's.
    const state = new Map(first === null ? [] : differs.get(first) ?? []);
    const kept = [];
    let wrote = 0;
    for (const line of rest) {
      if (line.startsWith('from ') || line.startsWith('merge ')) continue;
      if (line.startsWith('M ')) {
        wrote += 1;
        const [, mode, sha, ...pathParts] = line.split(' ');
        const written = pathParts.join(' ');
        const path = unquoted(written);
        const before = `${mode} ${sha}`;
        if (await drop(path, at)) {
          if (await parentValue(state, first, path) !== null) kept.push({ line: `D ${written}` });
          settle(state, path, null, before);
          continue;
        }
        const made = mode === '160000' || !await reads(path, sha) ? null : await changedOf(path, sha);
        // Only a file changed here, or one held otherwise before, can be what the parent holds
        // already: fast-export names a file only where the commit changed it.
        if (made === null && !state.has(path)) {
          kept.push({ line });
          continue;
        }
        const now = made === null ? before : `${mode} ${blobName(made)}`;
        const was = await parentValue(state, first, path);
        settle(state, path, now, before);
        if (now === was) continue;
        kept.push(made === null ? { line } : { line: `M ${mode} inline ${written}`, data: made });
        continue;
      }
      if (line.startsWith('D ')) {
        wrote += 1;
        const path = unquoted(line.slice(2));
        const was = state.has(path) ? state.get(path) : 'held';
        state.delete(path);
        if (was !== null) kept.push({ line });
        continue;
      }
      kept.push({ line });
    }
    marks.set(mark, { commit, parent: first });
    differs.set(mark, state);
    // A commit left with nothing it writes, which wrote something, goes, unless it joins two
    // lines of the history or is to be kept, and its children follow its parent.
    if (!keepEmpty && wrote > 0 && kept.every(({ line }) => !/^(?:[MDCR] |deleteall$)/.test(line)) && parents.length <= 1) {
      instead.set(mark, first);
      continue;
    }
    const newMessage = await message(command.message.toString('utf8'));
    const body = newMessage === null || newMessage === undefined ? command.message : Buffer.from(newMessage, 'utf8');
    // A commit whose parents all went starts the history again, as fast-import would otherwise
    // take the branch as it stands for its parent.
    if (parents.length > 0 && parents.every((parent) => resolve(parent) === null)) write(`reset ${head[0].slice(7)}\n`);
    for (const line of head) write(`${line}\n`);
    write(`data ${body.length}\n`);
    out.push(body);
    write('\n');
    for (const parent of parents) {
      const resolved = resolve(parent);
      if (resolved === null) continue;
      write(`${parent === first ? 'from' : 'merge'} ${resolved}\n`);
    }
    for (const { line, data } of kept) {
      write(`${line}\n`);
      if (data) {
        write(`data ${data.length}\n`);
        out.push(data);
        write('\n');
      }
    }
    write('\n');
  }

  const folder = mkdtempSync(join(tmpdir(), 'konzilo-marks-'));
  try {
    const exported = join(folder, 'marks');
    await git(['fast-import', '--quiet', '--force', `--export-marks=${exported}`], { input: Buffer.concat(out) });
    const made = new Map(readFileSync(exported, 'utf8').split('\n').filter(Boolean).map((line) => line.split(' ')));
    const renamed = new Map();
    for (const [mark, { commit }] of marks) {
      const stands = resolve(mark);
      renamed.set(commit, stands === null ? null : stands.startsWith(':') ? made.get(stands) ?? null : stands);
    }
    const headNow = (await git(['rev-parse', `refs/heads/${branch}`])).toString('utf8').trim();
    return { head: headNow, renamed, gone: new Set([...instead.keys()].map((mark) => marks.get(mark).commit)) };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
