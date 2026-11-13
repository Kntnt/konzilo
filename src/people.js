// A local copy's people (ADR 0007, ADR 0008): the accounts the seed makes, each with a known
// password and a second factor from a key it keeps, so that each of the three roles can be signed
// in as. `KONZILO_PEOPLE` lists them, and where it lists no one there is the one Admin that
// `KONZILO_ACCOUNT` names.

// Each role a person may have, with the team of the site's organisation that gives it.
export const ROLES = Object.freeze({ admin: 'admins', editor: 'editors', reviewer: 'reviewers' });

const SAID = `${Object.keys(ROLES).slice(0, -1).join(', ')} or ${Object.keys(ROLES).at(-1)}`;

// A name Forgejo takes for an account, which is also safe in a file's name: letters, digits and
// single dots, dashes or underscores between them, at most 40 characters.
export const isPersonName = (name) => typeof name === 'string' && name.length <= 40 && /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(name);

// The file in `state` that names the account whose key is `account-totp`: the one
// `KONZILO_ACCOUNT` named at the first start that wrote it, whatever it names later.
export const ACCOUNT_NAME = 'account-name';

const nameOf = (name) => {
  if (!isPersonName(name)) throw new Error(`"${name}" is no account's name`);
  return name.toLowerCase();
};

// The file in `state` that keeps a person's key: `account-totp` for the account named `account`,
// the file a copy seeded with one account keeps its key in, and `people/<name>-totp` for everyone
// else, apart from the keys of the accounts Konzilo makes. Forgejo takes a name in either case as
// one account, so the file is named in lower case.
export function keyFileOf(name, account) {
  const lower = nameOf(name);
  return lower === account?.toLowerCase() ? 'account-totp' : `people/${lower}-totp`;
}

// The secrets a person's password is read from, the first that is there: their own, then the one
// every person shares where they have none.
export const passwordFilesOf = (name) => [`account-password-${nameOf(name)}`, 'account-password'];

// Puts `person` in the team of their role, and takes them out of the other roles' teams, through
// `call(method, path)`, which answers { status, body } from Forgejo's API, with `teams` as the
// organisation's are listed there. It changes nothing that is already so, and no other team or
// person.
export async function seat(call, teams, { name, team: wanted }) {
  for (const team of Object.values(ROLES)) {
    const id = teams.find((one) => one.name === team)?.id;
    if (id === undefined) throw new Error(`the site has no team ${team}`);
    const path = `/teams/${id}/members/${encodeURIComponent(name)}`;
    const asked = await call('GET', path);
    if (![200, 404].includes(asked.status)) throw new Error(`asking whether ${name} is in ${team}: ${asked.status} ${JSON.stringify(asked.body)}`);
    const member = asked.status === 200;
    if (team === wanted && !member) {
      const put = await call('PUT', path);
      if (put.status !== 204) throw new Error(`putting ${name} in ${team}: ${put.status} ${JSON.stringify(put.body)}`);
    } else if (team !== wanted && member) {
      const taken = await call('DELETE', path);
      if (taken.status !== 204) throw new Error(`taking ${name} out of ${team}: ${taken.status} ${JSON.stringify(taken.body)}`);
    }
  }
}

// The people `environment` lists, each { name, role, team }: `KONZILO_PEOPLE`, each person as
// `name:role`, apart by commas or spaces, such as `anna:admin,ebba:editor,rut:reviewer`, and
// where it lists no one, the one Admin `KONZILO_ACCOUNT` names. `taken`: the names of the accounts
// Konzilo makes itself, and of the site's organisation, which shares their names. Throws, naming
// the setting and the person, on what Forgejo or the seed could not take.
export function peopleOf(environment = process.env, { taken = [] } = {}) {
  const { KONZILO_ACCOUNT: account, KONZILO_PEOPLE: listed = '' } = environment;
  const reserved = new Set(taken.map((name) => name.toLowerCase()));
  const named = (setting, name) => {
    if (!isPersonName(name)) throw new Error(`${setting}: "${name}" is no account's name: letters, digits and single dots, dashes or underscores between them, at most 40`);
    if (reserved.has(name.toLowerCase())) throw new Error(`${setting}: "${name}" is the name of an account Konzilo makes, or of the site`);
    return name;
  };
  const entries = listed.split(/[\s,]+/).filter(Boolean);
  if (entries.length === 0) {
    if (!account) throw new Error('KONZILO_PEOPLE lists no one, and KONZILO_ACCOUNT names no one');
    return [{ name: named('KONZILO_ACCOUNT', account), role: 'admin', team: ROLES.admin }];
  }
  const seen = new Set();
  return entries.map((entry) => {
    const [name, given, ...more] = entry.split(':');
    if (!given) throw new Error(`KONZILO_PEOPLE: "${entry}" has no role: ${SAID}`);
    const role = given.toLowerCase();
    if (more.length > 0 || !Object.hasOwn(ROLES, role)) throw new Error(`KONZILO_PEOPLE: "${entry}" has a role Konzilo does not have: ${SAID}`);
    named('KONZILO_PEOPLE', name);
    if (seen.has(name.toLowerCase())) throw new Error(`KONZILO_PEOPLE: "${name}" is listed twice`);
    seen.add(name.toLowerCase());
    return { name, role, team: ROLES[role] };
  });
}
