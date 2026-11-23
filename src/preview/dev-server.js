// Astro's dev server for a live preview: it starts when someone needs it, and stops after a
// time with nobody looking, since it is the one thing here that costs memory (ADR 0032). It is
// listened to for the reloads it tells its pages of, so that a change to what it shows, such as
// another moment of the timeline, is waited for until a page asked for is the changed one.

import { execFile, spawn as spawnProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';

// The command as a site's own dependencies hold it.
const ASTRO = 'node_modules/.bin/astro';
const IDLE = 15 * 60 * 1000;
const STARTS_WITHIN = 180_000;
const LOOKS_EVERY = 200;
// How long a change to what it shows is waited for at most, should no reload come of it, and how
// long it stays without another once one has, since a change to many files may come in several.
const SETTLES_WITHIN = 5000;
const QUIET = 250;

// What the site's own `predev` script makes before its dev server starts, such as files written
// from a design, as `npm run dev` runs it, and as the builder's build runs `prebuild`: where the
// site's package.json declares one, it runs in the site's folder with the dev server's
// environment. Done once it has ended; rejected, with what it said, where it fails.
async function runPredev(root, environment) {
  const manifest = join(root, 'package.json');
  if (!existsSync(manifest) || typeof JSON.parse(readFileSync(manifest, 'utf8')).scripts?.predev !== 'string') return;
  try {
    await promisify(execFile)('npm', ['run', 'predev', '--silent'], { cwd: root, env: environment, maxBuffer: 1024 * 1024 * 64 });
  } catch (error) {
    throw new Error(`the site's predev failed: ${(error.stderr || error.message).trim()}`);
  }
}

// Vite's own channel to the pages of the dev server at `port`, which says when to reload: `heard()`
// for each reload it tells. Asked from here, with no page's origin, it needs no page's token. Gives
// what stops listening; until then, a channel that closes is opened again.
export function hearReloads(port, heard) {
  let socket = null;
  let stopped = false;
  const open = () => {
    socket = new WebSocket(`ws://127.0.0.1:${port}/`, 'vite-hmr');
    socket.addEventListener('message', ({ data }) => {
      try {
        if (JSON.parse(String(data)).type === 'full-reload') heard();
      } catch {
        // Not a message of Vite's.
      }
    });
    socket.addEventListener('error', () => {});
    socket.addEventListener('close', () => {
      if (!stopped) setTimeout(open, 1000).unref?.();
    });
  };
  open();
  return () => {
    stopped = true;
    socket?.close();
  };
}

const answers = (port) => new Promise((resolve) => {
  const asked = request({ host: '127.0.0.1', port, path: '/', method: 'HEAD', timeout: 2000 }, (answer) => {
    answer.resume();
    resolve(true);
  });
  asked.on('error', () => resolve(false));
  asked.on('timeout', () => {
    asked.destroy();
    resolve(false);
  });
  asked.end();
});

// `root`: the site's folder. `port`: the dev server's own, which only the gate reaches.
// `environment`: what it runs with, and nothing else, so that no secret is in reach. `before`:
// what must be done before it starts, after which the site's `predev` runs, at each start
// (`predev`). `idle`: how long it stays with nobody looking. `hears`: how its reloads are listened
// to, as hearReloads() does.
export function devServer({ root, port, environment, before = async () => {}, predev = runPredev, idle = IDLE, spawn = spawnProcess, ask = answers, hears = hearReloads, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), startsWithin = STARTS_WITHIN, settlesWithin = SETTLES_WITHIN }) {
  let child = null;
  let starting = null;
  let answering = false;
  let timer = null;
  // How many reloads it has told, and what stops listening to them.
  let reloads = 0;
  let unhear = null;
  const waiting = new Set();

  const stop = () => {
    clearTimeout(timer);
    timer = null;
    unhear?.();
    unhear = null;
    child?.kill('SIGTERM');
    child = null;
    starting = null;
    answering = false;
  };

  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(stop, idle);
    timer.unref?.();
  };

  const start = async () => {
    await before();
    await predev(root, environment);
    // A lock file in the volume names a process of an earlier container, whose number something
    // else may have by now, and this is the one dev server here.
    const started = spawn(process.execPath, [ASTRO, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'], { cwd: root, env: environment, stdio: ['ignore', 'ignore', 'inherit'] });
    child = started;
    let ended = false;
    started.on('exit', () => {
      ended = true;
      if (child === started) {
        child = null;
        starting = null;
        answering = false;
        unhear?.();
        unhear = null;
      }
    });
    for (let waited = 0; waited < startsWithin; waited += LOOKS_EVERY) {
      if (ended) throw new Error('the dev server stopped as it started');
      if (await ask(port)) {
        answering = child === started;
        if (answering) {
          unhear?.();
          unhear = hears(port, () => {
            reloads += 1;
            for (const told of waiting) told();
            waiting.clear();
          });
        }
        return;
      }
      await wait(LOOKS_EVERY);
    }
    started.kill('SIGTERM');
    throw new Error('the dev server did not answer in time');
  };

  return {
    port,
    touch,
    stop,
    running: () => child !== null,
    // Whether it answers now, so that a page asked for is a moment away rather than a start.
    ready: () => answering,
    // Does `work`, which changes what it shows and gives { changed }, and, where something changed
    // while it answers, returns once it has told its pages to reload, and a moment has passed with
    // no other reload, or after a while should none come.
    async changing(work) {
      if (!answering) return work();
      let told;
      const reloaded = new Promise((resolve) => {
        told = resolve;
      });
      waiting.add(told);
      let outcome;
      try {
        outcome = await work();
      } finally {
        if (!outcome?.changed) waiting.delete(told);
      }
      if (!outcome?.changed) return outcome;
      const settled = reloaded.then(async () => {
        for (let seen = reloads; ; seen = reloads) {
          await wait(QUIET);
          if (reloads === seen) return;
        }
      });
      await Promise.race([settled, wait(settlesWithin)]);
      waiting.delete(told);
      return outcome;
    },

    // Starts it if it is not running, and returns when it answers. Someone is looking.
    ensure() {
      touch();
      starting ??= start().catch((error) => {
        starting = null;
        throw error;
      });
      return starting;
    },
  };
}
