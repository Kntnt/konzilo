// Astro's dev server for a live preview: it starts when someone needs it, and stops after a
// time with nobody looking, since it is the one thing here that costs memory (ADR 0032).

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
// (`predev`). `idle`: how long it stays with nobody looking.
export function devServer({ root, port, environment, before = async () => {}, predev = runPredev, idle = IDLE, spawn = spawnProcess, ask = answers, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), startsWithin = STARTS_WITHIN }) {
  let child = null;
  let starting = null;
  let answering = false;
  let timer = null;

  const stop = () => {
    clearTimeout(timer);
    timer = null;
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
      }
    });
    for (let waited = 0; waited < startsWithin; waited += LOOKS_EVERY) {
      if (ended) throw new Error('the dev server stopped as it started');
      if (await ask(port)) {
        answering = child === started;
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
