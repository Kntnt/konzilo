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

// Whether Forgejo says that the one holding this credential may write to the repository.
export async function mayWrite({ forgejo, repository, credential, get = fetch }) {
  if (!CREDENTIAL.test(credential ?? '')) return false;
  const asked = await get(`${forgejo}/api/v1/repos/${repository}`, { headers: { authorization: credential } });
  if (!asked.ok) return false;
  const { permissions } = await asked.json();
  return permissions?.push === true;
}
