// A local copy's people (ADR 0007, ADR 0008): the accounts the seed makes, each with a known
// password and a second factor from a key it keeps, so that each of the three roles can be signed
// in as. `KONZILO_PEOPLE` lists them, and where it lists no one there is the one Admin that
// `KONZILO_ACCOUNT` names.

import { must } from './forgejo.js';

// Each role a person may have, with the team of the site's organisation that gives it.
export const ROLES = Object.freeze({ admin: 'admins', editor: 'editors', reviewer: 'reviewers' });

// The roles by name, as a refusal lists them: `admin, editor or reviewer`.
const ROLE_NAMES = `${Object.keys(ROLES).slice(0, -1).join(', ')} or ${Object.keys(ROLES).at(-1)}`;

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
export async function putInRoleTeam(call, teams, { name, team: wanted }) {
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

// Makes sure of each of `people`, as peopleOf() gives them, at a start (ADR 0007, ADR 0008):
// their account, made with their password where Forgejo has none; a second factor, enrolled
// through Forgejo's forms, whose key `state` keeps; and the team of their role and no other
// role's. It changes nothing that is already so. A person whose account Forgejo has already,
// with no key `state` keeps, is enrolled where the seed signs in as them with the password it has
// and they have no second factor. Where it cannot, they are put in their team all the same, the
// seed's log names them with what the operator can do, and the start goes on: a local copy's
// people never stop it. An account the seed has just made that Forgejo will not enrol does.
//
//   call        Forgejo's API as the instance's account: (method, path, body) => { status, body }
//   teams       the site's teams, as Forgejo's API lists them
//   enrol       (name, password) => { key } or { refused }, as enrolSecondFactor() of forgejo.js
//   known       the key a file of `state` keeps, by the file's name, else null
//   remember    (file, key), which keeps a key in `state`
//   passwordOf  a person's password, by their name
//   account     the name whose key is `account-totp` (keyFileOf())
//   log         a line of the seed's log
export async function seedPeople(people, { call, teams, enrol, known, remember, passwordOf, account, log }) {
  for (const person of people) {
    const { name } = person;
    const keyFile = keyFileOf(name, account);
    const found = await call('GET', `/users/${encodeURIComponent(name)}`);
    must(`looking for the account ${name}`, found, 200, 404);
    const made = found.status === 404;
    if (made || !known(keyFile)) {
      const password = passwordOf(name);
      if (made) {
        must(`making the account ${name}`, await call('POST', '/admin/users', {
          username: name,
          email: `${name}@localhost.invalid`,
          password,
          must_change_password: false,
          send_notify: false,
          visibility: 'private',
        }), 201);
      }
      const enrolled = await enrol(name, password);
      if (enrolled.key) remember(keyFile, enrolled.key);
      else if (made) throw new Error(`enrolling ${name}, whose account the seed made: ${enrolled.refused === 'password' ? 'Forgejo does not sign it in with its password' : 'it has a second factor already'}`);
      else log(notEnrolled(name, enrolled.refused));
    }
    await putInRoleTeam(call, teams, person);
  }
}

// What the seed's log says of a person whose account Forgejo has already and whom it could not
// enrol, `refused` saying why (enrolSecondFactor()), with what the operator can do.
function notEnrolled(name, refused) {
  const why = refused === 'password'
    ? 'the seed cannot sign in as them with the password it has'
    : 'they have a second factor the seed did not enrol, whose key it cannot keep';
  const remedy = refused === 'password'
    ? `give the seed their password as the secret account-password-${name.toLowerCase()}, or remove their account in Forgejo, and start again`
    : 'remove their account in Forgejo, and start again';
  return `seed: ${name} is in Forgejo already, and ${why}, so the code command prints no code for them. They sign in with their own and are in the team of their role; for the seed to keep their key, ${remedy}.`;
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
    if (!given) throw new Error(`KONZILO_PEOPLE: "${entry}" has no role: ${ROLE_NAMES}`);
    const role = given.toLowerCase();
    if (more.length > 0 || !Object.hasOwn(ROLES, role)) throw new Error(`KONZILO_PEOPLE: "${entry}" has a role Konzilo does not have: ${ROLE_NAMES}`);
    named('KONZILO_PEOPLE', name);
    if (seen.has(name.toLowerCase())) throw new Error(`KONZILO_PEOPLE: "${name}" is listed twice`);
    seen.add(name.toLowerCase());
    return { name, role, team: ROLES[role] };
  });
}
