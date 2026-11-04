// Astro's dev server for a live preview: it starts when someone needs it, and stops after a
// time with nobody looking, since it is the one thing here that costs memory (ADR 0032).

import { spawn as spawnProcess } from 'node:child_process';
import { request } from 'node:http';

// The command as a site's own dependencies hold it.
const ASTRO = 'node_modules/.bin/astro';
const IDLE = 15 * 60 * 1000;
const STARTS_WITHIN = 180_000;
const LOOKS_EVERY = 200;

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
// what must be done before it starts. `idle`: how long it stays with nobody looking.
export function devServer({ root, port, environment, before = async () => {}, idle = IDLE, spawn = spawnProcess, ask = answers, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), startsWithin = STARTS_WITHIN }) {
  let child = null;
  let starting = null;
  let timer = null;

  const stop = () => {
    clearTimeout(timer);
    timer = null;
    child?.kill('SIGTERM');
    child = null;
    starting = null;
  };

  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(stop, idle);
    timer.unref?.();
  };

  const start = async () => {
    await before();
    const started = spawn(process.execPath, [ASTRO, 'dev', '--host', '127.0.0.1', '--port', String(port)], { cwd: root, env: environment, stdio: ['ignore', 'ignore', 'inherit'] });
    child = started;
    let ended = false;
    started.on('exit', () => {
      ended = true;
      if (child === started) {
        child = null;
        starting = null;
      }
    });
    for (let waited = 0; waited < startsWithin; waited += LOOKS_EVERY) {
      if (ended) throw new Error('the dev server stopped as it started');
      if (await ask(port)) return;
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
