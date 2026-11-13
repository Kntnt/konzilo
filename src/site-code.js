// The site's code as a program runs it (ADR 0031, ADR 0032): the builder and the live preview each
// prepare a copy of their own at a start, from the site's folder as it now is, in their work
// folder, with its dependencies installed only when what they are installed from has changed
// (compose/builder/prepare-site.sh), and without what a site repository holds of a local copy's
// content or its own demo content, which reach them as source instead.

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PREPARE = fileURLToPath(new URL('../compose/builder/prepare-site.sh', import.meta.url));

// Prepares the copy in `work`, the program's work folder, from `site`, the site's folder; done
// once the copy and its dependencies are there, and rejected where the script fails.
export function prepareSiteCode(work, site = '/site') {
  return run('sh', [PREPARE, work, '--exclude=./content', '--exclude=./demo-content'], { cwd: site, maxBuffer: 1024 * 1024 * 64 });
}
