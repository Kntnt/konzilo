// The Astro configuration of a throwaway site repository in this suite, with
// Konzilo's integration, the environment its builds run in, and how the suite
// waits for a build.
//
// Each such repository links node_modules to the core's, so Astro's default
// cache, node_modules/.astro, would be one folder for every build the suite
// runs, the content layer's data store in it among them: builds that run at
// once, as the test runner runs the files, then read and write each other's
// content, and a page goes missing now and then. Vite's cache of optimised
// dependencies, node_modules/.vite, is shared the same way: dev servers that
// start at once on an empty cache write over each other's work, and one may
// never answer. Each repository keeps both caches in itself, in CACHE_DIR.
//
// On macOS, Vite's watcher takes a site's changes from the system's file events,
// and the system hands those out late while many files are written anywhere on
// the machine, by seconds and now and then by more than a minute, as when this
// suite writes 50,001 posts for a sitemap. A dev server started in a repository
// written a moment before is then told, once it runs, of the files the
// repository was made of, its astro.config.mjs among them. It takes that for a
// changed configuration and restarts, and a restart that comes while it starts
// leaves it answering with no content for as long as it runs. A content file
// changed later is taken up when its event comes, which may be after a test has
// stopped waiting. So on macOS each dev server of the suite looks at the files
// itself (WATCH), and learns of a change within a moment whatever the system's
// file events do. In Linux it keeps the kernel's events, which come at once and
// only for what happens after the watching starts.

import { spawnSync } from 'node:child_process';

export const CACHE_DIR = '.astro-cache';

// How Vite's watcher learns of a change, as its `server.watch`.
export const WATCH = { usePolling: process.platform === 'darwin' };

// The public host every build of the suite is made for.
export const ORIGIN = 'https://www.example.com';

// The environment Astro runs in: never reported anywhere, and building for
// ORIGIN. A dev server looks for a new version as it starts, and writes that it
// has in .astro/settings.json, and it counts on being told of that once. macOS
// can tell it twice, and the second time it restarts, which at that moment leaves
// a server that never answers.
export const astroEnvironment = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', ASTRO_DISABLE_UPDATE_CHECK: 'true', KONZILO_ORIGIN: ORIGIN };

// `integration`: the path of Konzilo's Astro integration in the core;
// `options`: the integration's options, as the site's configuration gives
// them, if any.
export function astroConfig(integration, options) {
  const given = options === undefined ? '' : JSON.stringify(options);
  return `import konzilo from ${JSON.stringify(integration)};\n\nexport default { cacheDir: './${CACHE_DIR}', vite: { cacheDir: './${CACHE_DIR}/vite', server: { watch: ${JSON.stringify(WATCH)} } }, integrations: [konzilo(${given})] };\n`;
}

// How long the suite waits for a build, or another command it starts and waits for, before
// it stops it: several times what the slowest takes while the machine is at its busiest.
export const ENDS_WITHIN = 600_000;

// `command` with `args`, waited for as spawnSync() waits, with its `options`, but no longer
// than ENDS_WITHIN: one that has not ended by then is stopped, and its test fails saying
// so, where it would have kept the whole run waiting with no word of why.
export function commandSync(command, args, options = {}) {
  const within = options.timeout ?? ENDS_WITHIN;
  // Stopped outright: a Node whose main thread waits in its exit runs no handler of a signal.
  const result = spawnSync(command, args, { killSignal: 'SIGKILL', ...options, timeout: within });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`${[command, ...args].join(' ')} had not ended after ${within / 1000} seconds, and was stopped`);
  }
  return result;
}

// Node with `args`, as a build of the suite runs Astro's command, waited for likewise.
export function nodeSync(args, options) {
  return commandSync(process.execPath, args, options);
}
