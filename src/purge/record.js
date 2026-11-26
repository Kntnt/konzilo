// The record of a site's purges (ADR 0078), kept in the source repository on a branch of its own,
// `konzilo-purges`, which only the instance's account may write, so that it moves with the
// repository and nobody who edits can make it say what it does not. `purges.json` holds:
//
// - `purges`, each purge that was made, oldest first, { at, by: { login, name } }: who and when,
//   and nothing of what;
// - `pushes`, by the new identity of each save a purge rewrote, the push that brought the save as
//   it was, { login, name, at }, or null where Forgejo had no record of its account. A rewritten
//   save is pushed anew by the instance's account, so its push in Forgejo's feed is the purge's;
//   whoever reads who pushed a save (ADR 0008, ADR 0074) reads it here first.

export const PURGES_BRANCH = 'konzilo-purges';
export const PURGES_FILE = 'purges.json';

const isPusher = (value) => value === null || (typeof value?.login === 'string' && typeof value?.name === 'string' && typeof value?.at === 'string');

// The record a file holds, or an empty one where it holds none, or something else.
export function purgeRecord(text) {
  let read;
  try {
    read = JSON.parse(text ?? 'null');
  } catch {
    read = null;
  }
  const purges = Array.isArray(read?.purges) ? read.purges.filter((one) => typeof one?.at === 'string' && typeof one?.by?.login === 'string').map(({ at, by }) => ({ at, by: { login: by.login, name: typeof by.name === 'string' ? by.name : by.login } })) : [];
  const pushes = {};
  for (const [sha, pusher] of Object.entries(read?.pushes ?? {})) {
    if (/^[0-9a-f]{40,64}$/.test(sha) && isPusher(pusher)) pushes[sha] = pusher === null ? null : { login: pusher.login, name: pusher.name, at: pusher.at };
  }
  return { purges, pushes };
}

// The file of a record.
export const recordFile = ({ purges, pushes }) => `${JSON.stringify({ purges, pushes: Object.fromEntries(Object.entries(pushes).sort(([a], [b]) => (a < b ? -1 : 1))) }, null, 2)}\n`;

// Keeps the branch of the record to the instance's account alone, by a rule of Forgejo's that
// holds for the name whether or not the branch is there yet, so that nobody else can make it
// first. `call(method, path, body)` asks Forgejo's API as the instance's account, giving
// { status, body }. Changes nothing that is so already.
export async function keepPurgesProtected(call, repository, instance = 'konzilo') {
  const listed = await call('GET', `/repos/${repository}/branch_protections`);
  if (listed.status !== 200) throw new Error(`listing the branch protections: ${listed.status}`);
  const rule = { enable_push: true, enable_push_whitelist: true, push_whitelist_usernames: [instance], push_whitelist_teams: [], push_whitelist_deploy_keys: false };
  const found = listed.body.find((one) => one.rule_name === PURGES_BRANCH || one.branch_name === PURGES_BRANCH);
  if (found && found.enable_push && found.enable_push_whitelist && JSON.stringify(found.push_whitelist_usernames) === JSON.stringify([instance]) && (found.push_whitelist_teams ?? []).length === 0 && !found.push_whitelist_deploy_keys) return;
  const made = found
    ? await call('PATCH', `/repos/${repository}/branch_protections/${encodeURIComponent(found.rule_name ?? found.branch_name)}`, rule)
    : await call('POST', `/repos/${repository}/branch_protections`, { rule_name: PURGES_BRANCH, ...rule });
  if (![200, 201].includes(made.status)) throw new Error(`keeping ${PURGES_BRANCH} to ${instance}: ${made.status} ${JSON.stringify(made.body)}`);
}
