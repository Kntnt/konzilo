#!/usr/bin/env node
// Run the test suite, or the test files given, three at a time, with the
// system's temporary folder pointed at one of the run's own, which goes when the
// run ends: a site repository a test makes stays behind nowhere, also when a test
// stops half way.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folder = mkdtempSync(join(realpathSync(tmpdir()), 'konzilo-tests-'));
const given = process.argv.slice(2);
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=3', ...(given.length > 0 ? given : ['tests/**/*.test.js'])], {
  stdio: 'inherit',
  env: { ...process.env, TMPDIR: folder, ASTRO_TELEMETRY_DISABLED: '1' },
});
rmSync(folder, { recursive: true, force: true });
process.exit(run.status ?? 1);
