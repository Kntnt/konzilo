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
