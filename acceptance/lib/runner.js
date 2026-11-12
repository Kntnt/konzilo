// The live preview's runner, as a suite that runs the real gate before a small site of its own
// has it: nothing to read, every page built from what `built` holds at its path, as the real
// runner's at() gives it, or from nothing, the 404 page from `notFound`, and every draft taken,
// with no address. tests/preview-runner.test.js holds it to the real runner's calls, all of
// which the gate may make.
export const runnerStandIn = ({ built = {}, notFound = null } = {}) => ({
  problem: () => null,
  take: async () => ({ address: null, refusals: [] }),
  refresh: async () => null,
  at: (path) => built[path] ?? null,
  notFoundAt: () => notFound,
});
