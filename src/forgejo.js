// What the core asks of the site's Forgejo in more than one place.

// What Git needs to reach a repository with a credential that is never written to disk.
export const gitEnvironment = ({ user, token, home }) => ({
  PATH: process.env.PATH,
  HOME: home,
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'http.extraHeader',
  GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`,
});

// What a browser may send as a credential, and nothing else is passed on to Forgejo.
export const CREDENTIAL = /^(?:token|Bearer) [\w.~+/=-]+$/;

// What Forgejo says the one holding this credential may do with the repository: { reads, writes }.
// An Admin and an Editor may write to the source repository, a Reviewer may read it alone, and
// someone in none of the site's teams may do neither, since it is private (ADR 0008).
export async function accessTo({ forgejo, repository, credential, get = fetch }) {
  if (!CREDENTIAL.test(credential ?? '')) return { reads: false, writes: false };
  const asked = await get(`${forgejo}/api/v1/repos/${repository}`, { headers: { authorization: credential } });
  if (!asked.ok) return { reads: false, writes: false };
  const { permissions } = await asked.json();
  const writes = permissions?.push === true;
  return { reads: writes || permissions?.pull === true, writes };
}

// Whether Forgejo says that the one holding this credential may write to the repository.
export async function mayWrite(asked) {
  return (await accessTo(asked)).writes;
}

// Forgejo lists a page at a time, and this many at most on each.
const LISTED = 50;

// The teams of `organisation`, as Forgejo shows them to `token`, a credential that may read them
// (ADR 0008): members(name), the logins of the members of the team `name`, none where it has no
// such team. Who is in a team Forgejo tells only those in it and the instance administrator, so
// the token is one of the instance's account that can read the teams and nothing else. The teams,
// and a team's members, are read page after page, so that none past the first is missed.
export function organisationTeams({ forgejo, organisation, token, get = fetch }) {
  const every = async (path) => {
    const found = [];
    for (let page = 1; ; page += 1) {
      const answer = await get(`${forgejo}/api/v1${path}?limit=${LISTED}&page=${page}`, { headers: { authorization: `token ${token}` } });
      if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} to ${path}`);
      const listed = await answer.json();
      found.push(...listed);
      if (listed.length < LISTED) return found;
    }
  };
  let teams = null;
  return {
    async members(name) {
      teams ??= every(`/orgs/${encodeURIComponent(organisation)}/teams`);
      const team = (await teams).find((one) => one.name === name);
      return team ? (await every(`/teams/${team.id}/members`)).map(({ login }) => login) : [];
    },
  };
}
