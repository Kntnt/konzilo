// What the live preview's one dev server shows (ADR 0032): one moment of the timeline at a time,
// since it reads one content folder. What is asked of a moment, a page or a draft's look, waits
// until the folder shows that moment as it last ran, and the folder is made to show another only
// once nothing is being asked of the one it shows, so that no page is drawn from a folder that
// changes under it. What is asked is taken in turn: a moment asked for later waits for the one
// asked for first.

// How long a moment shown for a page that will look again stays for it, at most.
const HOLD = 6000;

// `runner`: the preview's runs, whose shows(moment) says whether the folder shows a moment as it
// last ran, and whose show(moment) makes it so, giving { changed }. `dev`: the dev server, whose
// changing(work) does that work and waits until it has the change.
export function previewStage({ runner, dev, hold = HOLD, now = Date.now, later = setTimeout }) {
  const keyOf = (moment) => moment ?? 'now';
  // What is asked, in turn: { moment, work, resolve, reject, asking }.
  const queue = [];
  let running = 0;
  let runningAt = null;
  let switching = false;
  // A moment shown for a page that will look again, until it does or `until`.
  let held = null;
  let waking = null;

  const holds = () => held !== null && now() < held.until;

  const run = (item) => {
    queue.splice(queue.indexOf(item), 1);
    running += 1;
    runningAt = keyOf(item.moment);
    if (item.asking) held = { key: runningAt, until: now() + hold };
    else if (held?.key === runningAt) held = null;
    Promise.resolve().then(item.work).then(item.resolve, item.reject).finally(() => {
      running -= 1;
      pump();
    });
  };

  const pump = () => {
    if (switching) return;
    // What the folder shows now runs, in turn, until something asked of another moment comes,
    // and what is asked of a moment held runs while it is held.
    for (const item of [...queue]) {
      const key = keyOf(item.moment);
      const runs = runner.shows(item.moment) && (running === 0 || runningAt === key);
      if (holds() && key !== held.key) continue;
      if (!runs) break;
      run(item);
    }
    if (running > 0 || queue.length === 0) return;
    const next = queue.find((item) => !holds() || keyOf(item.moment) === held.key) ?? null;
    if (next === null) {
      clearTimeout(waking);
      waking = later(pump, Math.max(0, held.until - now()));
      return;
    }
    switching = true;
    const { moment } = next;
    Promise.resolve().then(() => dev.changing(() => runner.show(moment))).then(() => {
      switching = false;
      // Shown, but something newer ran there meanwhile: that comes next, as asked.
      if (runner.shows(moment)) for (const item of queue.filter((one) => keyOf(one.moment) === keyOf(moment))) run(item);
      pump();
    }, (error) => {
      switching = false;
      for (const item of queue.filter((one) => keyOf(one.moment) === keyOf(moment))) {
        queue.splice(queue.indexOf(item), 1);
        item.reject(error);
      }
      pump();
    });
  };

  const enqueue = (moment, work, asking = false) => new Promise((resolve, reject) => {
    queue.push({ moment, work, resolve, reject, asking });
    pump();
  });

  return {
    // Runs `work` once the folder shows `moment`, and gives what it gives.
    at: (moment, work) => enqueue(moment, work),

    // Whether what is asked of `moment` would run at once.
    ready: (moment) => !switching && runner.shows(moment) && queue.length === 0 && (running === 0 || runningAt === keyOf(moment)) && (!holds() || held.key === keyOf(moment)),

    // Makes the folder show `moment`, in its turn, and holds it there for a while for a page that
    // will look again.
    ask: (moment) => {
      enqueue(moment, async () => {}, true).catch(() => {});
    },
  };
}
