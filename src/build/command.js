// A command the builder waits for (ADR 0031): the intake, the site's build and its search
// documents, each a program of its own. Each runs with the core's src/node-exit.js loaded first,
// so that it, and every Node it starts in turn, keeps V8's baseline compiler on its main thread;
// and one still running at the builder's time limit is stopped, with every process it started.
//
// A command runs as the first of a process group of its own, which the processes it starts
// join, and is stopped as that group, since npm starts the build in a process of its own, and
// stopping npm alone would leave the build running. It is stopped outright, by SIGKILL, since a
// Node whose main thread waits in its exit runs no handler of a signal. A process that leaves
// the group, as a daemon does, is not stopped; nothing a build runs does so.

import { spawn } from 'node:child_process';

const FIRST = `--import=${new URL('../node-exit.js', import.meta.url).href}`;
// The most output the builder takes from a command, a Git command's among them: 256 MiB.
export const BIG = 1024 * 1024 * 256;

// `given` NODE_OPTIONS, with the core's module loaded first.
export function nodeOptions(given = '') {
  return given.split(/\s+/).includes(FIRST) ? given : [given, FIRST].filter(Boolean).join(' ');
}

const counted = (count, unit) => `${count} ${unit}${count === 1 ? '' : 's'}`;
const duration = (ms) => (ms % 60_000 === 0 ? counted(ms / 60_000, 'minute') : counted(ms / 1_000, 'second'));

// A command that had not ended within its time limit, and was stopped.
export class TookTooLong extends Error {
  constructor(command, limit) {
    super(`${command} had not ended after ${duration(limit)}, and was stopped with every process it started`);
    this.name = 'TookTooLong';
  }
}

// `limit`: how long to wait for a command, in milliseconds. Gives a function that runs `program`
// with `args`, as execFile() does, in `cwd` with `env` and no more output than `maxBuffer`, and
// gives { stdout, stderr } once it has ended with 0. Where it ends otherwise, it rejects as
// execFile() does, with the exit's `code` and `signal`, and the `stdout` and `stderr`; where it
// has not ended within `limit`, with TookTooLong.
export function commandWithin(limit) {
  if (!Number.isInteger(limit) || limit <= 0) throw new TypeError(`a time limit is a whole number of milliseconds above 0, not ${limit}`);
  return (program, args, { cwd, env = process.env, maxBuffer = BIG } = {}) => new Promise((resolve, reject) => {
    const command = [program, ...args].join(' ');
    const child = spawn(program, args, { cwd, env: { ...env, NODE_OPTIONS: nodeOptions(env.NODE_OPTIONS) }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = { stdout: [], stderr: [] };
    let size = 0;
    let stopped = null;
    let settled = false;
    const timer = setTimeout(() => stop(new TookTooLong(command, limit)), limit);
    const settle = (go, value) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      go(value);
    };
    // The whole group, and, once the command itself has gone, its output too, which a process
    // outside the group could otherwise hold open.
    const stop = (why) => {
      if (stopped) return;
      stopped = why;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // The group has gone already.
      }
      const close = () => {
        child.stdout.destroy();
        child.stderr.destroy();
      };
      if (child.exitCode !== null || child.signalCode !== null) close();
      else child.once('exit', close);
    };
    for (const name of ['stdout', 'stderr']) {
      child[name].on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBuffer) stop(new Error(`${command} wrote more than ${maxBuffer} bytes, and was stopped with every process it started`));
        else output[name].push(chunk);
      });
    }
    child.on('error', (error) => settle(reject, error));
    child.on('close', (code, signal) => {
      if (stopped) return settle(reject, stopped);
      const stdout = Buffer.concat(output.stdout).toString('utf8');
      const stderr = Buffer.concat(output.stderr).toString('utf8');
      if (code === 0) return settle(resolve, { stdout, stderr });
      return settle(reject, Object.assign(new Error(`Command failed: ${command}\n${stderr}`), { code, signal, stdout, stderr }));
    });
  });
}
