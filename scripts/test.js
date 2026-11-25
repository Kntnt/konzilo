#!/usr/bin/env node
// Run the test suite, or the test files given, three at a time, with the
// system's temporary folder pointed at one of the run's own, which goes when the
// run ends: a site repository a test makes stays behind nowhere, also when a test
// stops half way. Every Node the run starts, the tests' own and each build and
// command they start in turn, loads tests/lib/node-exit.js first, without which
// one that exits may never end.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folder = mkdtempSync(join(realpathSync(tmpdir()), 'konzilo-tests-'));
const given = process.argv.slice(2);
const first = `--import=${new URL('../tests/lib/node-exit.js', import.meta.url).href}`;
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=3', ...(given.length > 0 ? given : ['tests/**/*.test.js'])], {
  stdio: 'inherit',
  env: { ...process.env, TMPDIR: folder, ASTRO_TELEMETRY_DISABLED: '1', NODE_OPTIONS: [process.env.NODE_OPTIONS, first].filter(Boolean).join(' ') },
});
rmSync(folder, { recursive: true, force: true });
process.exit(run.status ?? 1);
