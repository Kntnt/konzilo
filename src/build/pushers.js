// Who pushed each commit, as Forgejo recorded it. What a commit says of its author or committer
// anyone with write access can write, through the API or a push, so the role check cannot go by
// it. The repository's activity feed names the account that did the push, and nobody but
// Forgejo writes there (ADR 0008).

const PUSHED = 'commit_repo';
const NO_COMMIT = /^0+$/;

// What a push in the feed brought: { after, before }, `before` null for a new branch. A feed
// entry says so in its comparison's address, and its commits are only the latest few.
function pushOf({ content }) {
  let held;
  try {
    held = JSON.parse(content);
  } catch {
    return null;
  }
  const after = held?.HeadCommit?.Sha1;
  if (typeof after !== 'string') return null;
  const [, before = null] = /\/compare\/([0-9a-f]+)\.\.\./.exec(held.CompareURL ?? '') ?? [];
  return { after, before: before === null || NO_COMMIT.test(before) ? null : before };
}

// Adds what these events say to `commits`, oldest event first, so that whoever first brought a
// commit is who pushed it, and pushing an Editor's commit again does not make it an Admin's.
// `commitsOf(after, before)` lists the commits a push brought, and none it does not know.
export async function addPushers(commits, events, commitsOf) {
  for (const event of [...events].sort((a, b) => a.id - b.id)) {
    const login = event.act_user?.login;
    const push = event.op_type === PUSHED ? pushOf(event) : null;
    if (!login || !push) continue;
    for (const commit of await commitsOf(push.after, push.before)) {
      if (!Object.hasOwn(commits, commit)) commits[commit] = login;
    }
  }
  return commits;
}

// The feed's entries after the one with the id `after`, by asking for page after page of the
// newest. `ask(page)` gives a page, as Forgejo answers it, and throws if it cannot.
export async function eventsAfter(after, ask) {
  const events = [];
  for (let page = 1; ; page += 1) {
    const entries = await ask(page);
    const fresh = entries.filter(({ id }) => id > after);
    events.push(...fresh);
    if (entries.length === 0 || fresh.length < entries.length) return events;
  }
}
