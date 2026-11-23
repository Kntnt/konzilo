// The live preview's runner, as a suite that runs the real gate before a small site of its own
// has it: nothing to read, a timeline of now and the moments in `timeline`, each one's
// `{ at, posts }`, every page built from what `built` holds at its path, as the real runner's
// at() gives it, or from nothing, at every moment, the 404 page from `notFound`, and every draft
// taken, with no address. The content folder shows whichever moment it was last told to, which
// `shown` lists in turn. tests/preview-runner.test.js holds it to the real runner's calls, all of
// which the gate may make.
export const runnerStandIn = ({ built = {}, notFound = null, timeline = [], shown = [] } = {}) => {
  // A dev server starts showing now.
  let held = 'now';
  return {
    problem: () => null,
    take: async () => ({ address: null, refusals: [], moment: null }),
    refresh: async () => null,
    timeline: () => [{ at: null, posts: [] }, ...timeline],
    moment: (asked) => (Number.isNaN(Date.parse(asked)) ? null : timeline.filter(({ at }) => at <= asked).at(-1)?.at ?? null),
    prepare: async (moment) => `version-${moment ?? 'now'}`,
    version: (moment) => `version-${moment ?? 'now'}`,
    shows: (moment) => held === (moment ?? 'now'),
    show: async (moment) => {
      const changed = held !== (moment ?? 'now');
      held = moment ?? 'now';
      shown.push(moment);
      return { changed };
    },
    at: (path) => built[path] ?? null,
    notFoundAt: () => notFound,
  };
};
