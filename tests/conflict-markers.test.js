// No file the repository tracks holds what Git leaves of a merge it could not make: the lines that
// open and close each side, and the one between them. A conflict left in is code that does not
// run or a document that says two things, and nothing else may notice it.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const core = fileURLToPath(new URL('../', import.meta.url));

// Written here by their lengths, so that this file holds none of them.
const OURS = '<'.repeat(7);
const BASE = '|'.repeat(7);
const BETWEEN = '='.repeat(7);
const THEIRS = '>'.repeat(7);

// The lines of `text`, by their numbers, that are a conflict's: one that opens or closes a side,
// alone or with a name after a space, and, inside one, the line of the common version and the
// bare line between the two sides. A bare line of equals signs elsewhere, as Markdown underlines
// a heading with, is none.
function conflictMarkers(text) {
  const marks = (line, marker) => line === marker || line.startsWith(`${marker} `);
  const found = [];
  let inside = false;
  text.split('\n').forEach((written, at) => {
    const line = written.replace(/\r$/, '');
    if (marks(line, OURS)) inside = true;
    else if (marks(line, THEIRS)) inside = false;
    else if (!(inside && (line === BETWEEN || marks(line, BASE)))) return;
    found.push(at + 1);
  });
  return found;
}

test('finds each line a conflict leaves, and a heading\'s underline outside one is none', () => {
  const conflict = ['before', `${OURS} HEAD`, 'ours', `${BASE} base`, 'base', BETWEEN, 'theirs', `${THEIRS} spec-51`, 'after'].join('\n');
  assert.deepEqual(conflictMarkers(conflict), [2, 4, 6, 8]);
  assert.deepEqual(conflictMarkers(`A heading\r\n${BETWEEN}\r\n\r\n${OURS}\r\nours\r\n${BETWEEN}\r\ntheirs\r\n${THEIRS}\r\n`), [4, 6, 8]);
  assert.deepEqual(conflictMarkers(`A heading\n${BETWEEN}\n\n${OURS}x is no marker\n`), []);
});

test('no file the repository tracks holds a conflict Git left', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: core, encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.ok(tracked.length > 100);
  const left = [];
  for (const path of tracked) {
    let bytes;
    try {
      bytes = readFileSync(join(core, path));
    } catch {
      continue;
    }
    // A file with a zero byte early on is binary, and Git merges none of it line by line.
    if (bytes.subarray(0, 8000).includes(0)) continue;
    const lines = conflictMarkers(bytes.toString('utf8'));
    if (lines.length > 0) left.push(`${path}: ${lines.join(', ')}`);
  }
  assert.deepEqual(left, []);
});
