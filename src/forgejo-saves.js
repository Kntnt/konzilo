// A save through Forgejo's API that Forgejo turned away because another save came first, or because
// it could not take one just now, is made again, a few times, after a wait. The service's feed reader
// and the editor's code in the browser share it, so it imports nothing.

// How many times a save is made at most.
const TRIES = 4;

const wait = (ms) => new Promise((go) => setTimeout(go, ms));

// After Forgejo answered the save's try number `tried` with `status`: waits, by `pause(ms)`, and
// gives true where the save is worth making again, after a conflict, a version out of date, a lock
// or Forgejo's own failure, before the last try; else gives false at once. Each wait is longer than
// the one before, and by a little chance, so that two saves that collided do not collide again.
export async function saveAgain(status, tried, pause = wait) {
  if (!([409, 422, 423].includes(status) || status >= 500) || tried >= TRIES) return false;
  await pause(200 * tried + Math.random() * 400);
  return true;
}
