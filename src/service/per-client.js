// How much of one client a kind of the role for visitors counts in the client's window of ten
// minutes (visitors.js, ADR 0044), by its digest, held in memory alone and forgotten as the window
// ends, up to the most it takes of a client in a window.

// `most`: the most a kind counts of one client in a window.
//
// Gives { room(client), count(client, count) }, each of a client as visitors.js tells it, { digest,
// ends }: `room` how many more of its the window takes; `count` counts `count` more, one where it
// is not given, and gives how many of its the window has counted.
export function perClient(most) {
  let window = null;
  const counted = new Map();
  const countedOf = (client) => {
    if (window !== client.ends.getTime()) {
      window = client.ends.getTime();
      counted.clear();
    }
    return counted.get(client.digest) ?? 0;
  };
  return {
    room: (client) => Math.max(0, most - countedOf(client)),
    count(client, count = 1) {
      const now = countedOf(client) + count;
      counted.set(client.digest, now);
      return now;
    },
  };
}

// The whole seconds a client is told to wait, as `Retry-After`, until `ends`, from `now`, both in
// milliseconds: one at least.
export const secondsUntil = (ends, now) => Math.max(1, Math.ceil((ends - now) / 1000));
