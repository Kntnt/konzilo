// Loaded first by every Node the builder starts (src/build/command.js) and every Node a run of
// the suite starts (scripts/test.js), through NODE_OPTIONS' --import, which each Node passes on to
// the Nodes it starts in turn: npm, Astro and what they start, the intake, so that each can end.
// NODE_OPTIONS refuses the flag itself, so a module sets it.
//
// Node 26.13.1 can stop for good as it exits by process.exit(), as Astro's command does after a
// build and the core's commands do once their output is taken. Its main thread waits for V8's
// worker threads to end, while one of them, at work on V8's baseline compiler in the background,
// waits for a garbage collection that only the main thread can run (nodejs/node#67596). The
// process then stays, using no CPU, and whatever waits for it waits with it. With that compiler
// kept to the main thread, no worker is left waiting for it. A worker of V8's next compiler can
// wait the same way, far more seldom, so this makes the deadlock rare and does not rule it out:
// a command the builder waits for, and a build the suite waits for, has a time limit too.

import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-concurrent-sparkplug');
