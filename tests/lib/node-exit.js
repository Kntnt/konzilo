// Loaded first by every Node the suite starts (scripts/test.js), so that each can end.
//
// Node 26.13.1 can stop for good as it exits by process.exit(), as Astro's command does
// after a build. Its main thread waits for V8's worker threads to end, while one of them, at
// work on V8's baseline compiler in the background, waits for a garbage collection that only
// the main thread can run (nodejs/node#67596). The process then stays, using no CPU, and the
// test that waits for it waits with it. With that compiler kept to the main thread, no worker
// is left waiting for it.

import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-concurrent-sparkplug');
