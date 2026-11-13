// A local copy's people (ADR 0007, ADR 0008): the setting that lists them with their roles, the
// one Admin of KONZILO_ACCOUNT where it lists none, where each person's password is read from and
// their key kept, and how the seed puts each in the team of their role.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { enrolSecondFactor } from '../src/forgejo.js';
import { keyFileOf, passwordFilesOf, peopleOf, putInRoleTeam, seedPeople } from '../src/people.js';
import { totp } from '../src/totp.js';

describe('the people a local copy holds', () => {
  test('are the one Admin KONZILO_ACCOUNT names, where KONZILO_PEOPLE lists no one', () => {
    for (const listed of [undefined, '', '  ']) {
      assert.deepEqual(peopleOf({ KONZILO_ACCOUNT: 'anna', KONZILO_PEOPLE: listed }), [{ name: 'anna', role: 'admin', team: 'admins' }]);
    }
  });

  test('are those KONZILO_PEOPLE lists, each by name and role, apart by commas or spaces, whoever KONZILO_ACCOUNT names', () => {
    const three = [
      { name: 'anna', role: 'admin', team: 'admins' },
      { name: 'ebba', role: 'editor', team: 'editors' },
      { name: 'rut', role: 'reviewer', team: 'reviewers' },
    ];
    for (const listed of ['anna:admin,ebba:editor,rut:reviewer', ' anna:admin, ebba:editor ,rut:reviewer ', 'anna:admin ebba:editor\trut:reviewer']) {
      assert.deepEqual(peopleOf({ KONZILO_ACCOUNT: 'anna', KONZILO_PEOPLE: listed }), three, listed);
    }
    assert.deepEqual(peopleOf({ KONZILO_ACCOUNT: 'anna', KONZILO_PEOPLE: 'Ebba.Holm:Editor' }), [{ name: 'Ebba.Holm', role: 'editor', team: 'editors' }]);
    assert.deepEqual(peopleOf({ KONZILO_PEOPLE: 'rut:reviewer' }), [{ name: 'rut', role: 'reviewer', team: 'reviewers' }]);
  });

  test('refuse a person with no role or one Konzilo does not have, naming the person', () => {
    for (const [listed, problem] of [
      ['anna:admin,ebba', /KONZILO_PEOPLE: "ebba" has no role: admin, editor or reviewer/],
      ['ebba:', /KONZILO_PEOPLE: "ebba:" has no role/],
      ['ebba:writer', /KONZILO_PEOPLE: "ebba:writer" has a role Konzilo does not have: admin, editor or reviewer/],
      ['ebba:editor:admin', /KONZILO_PEOPLE: "ebba:editor:admin" has a role Konzilo does not have/],
    ]) {
      assert.throws(() => peopleOf({ KONZILO_ACCOUNT: 'anna', KONZILO_PEOPLE: listed }), problem, listed);
    }
  });

  test('refuse a name Forgejo would not take, or one the list or the core has already', () => {
    for (const [listed, problem] of [
      ['-ebba:editor', /"-ebba" is no account's name/],
      ['ebba-:editor', /"ebba-" is no account's name/],
      ['eb..ba:editor', /"eb..ba" is no account's name/],
      ['../ebba:editor', /"..\/ebba" is no account's name/],
      ['ebba holm:editor', /"ebba" has no role/],
      [`${'e'.repeat(41)}:editor`, /is no account's name/],
      ['ebba:editor,Ebba:reviewer', /KONZILO_PEOPLE: "Ebba" is listed twice/],
      ['builder:editor', /KONZILO_PEOPLE: "builder" is the name of an account Konzilo makes/],
      ['Lantern:admin', /KONZILO_PEOPLE: "Lantern" is the name of an account Konzilo makes/],
    ]) {
      assert.throws(() => peopleOf({ KONZILO_ACCOUNT: 'anna', KONZILO_PEOPLE: listed }, { taken: ['konzilo', 'builder', 'lantern'] }), problem, listed);
    }
    assert.ok(peopleOf({ KONZILO_PEOPLE: `${'e'.repeat(40)}:editor,e.b_b-a:editor` }));
  });

  test('refuse to hold no one, and an account KONZILO_ACCOUNT names that Forgejo would not take', () => {
    assert.throws(() => peopleOf({}), /KONZILO_PEOPLE lists no one, and KONZILO_ACCOUNT names no one/);
    assert.throws(() => peopleOf({ KONZILO_PEOPLE: ', ' }), /lists no one/);
    assert.throws(() => peopleOf({ KONZILO_ACCOUNT: 'anna/../x' }), /KONZILO_ACCOUNT: "anna\/..\/x" is no account's name/);
    assert.throws(() => peopleOf({ KONZILO_ACCOUNT: 'konzilo' }, { taken: ['konzilo'] }), /KONZILO_ACCOUNT: "konzilo" is the name of an account Konzilo makes/);
  });
});

// Each person's key, in `state`: the account's of KONZILO_ACCOUNT in `account-totp`, the file a
// copy seeded with one account keeps its key in, and every other person's in a folder of their own, apart
// from the keys of the accounts Konzilo makes. Forgejo takes a name in either case as one account.
describe('a person\'s key file', () => {
  test('is account-totp for the account of KONZILO_ACCOUNT, in whatever case it is named', () => {
    assert.equal(keyFileOf('anna', 'anna'), 'account-totp');
    assert.equal(keyFileOf('Anna', 'anna'), 'account-totp');
  });

  test('is in people/, by the name in lower case, for everyone else', () => {
    assert.equal(keyFileOf('ebba', 'anna'), 'people/ebba-totp');
    assert.equal(keyFileOf('Ebba.Holm', 'anna'), 'people/ebba.holm-totp');
    assert.equal(keyFileOf('instance', 'anna'), 'people/instance-totp');
    assert.equal(keyFileOf('anna', undefined), 'people/anna-totp');
  });

  test('is refused for what is no person\'s name, so that it never leads out of the folder', () => {
    for (const name of ['../instance', 'people/ebba', '', '.', undefined]) assert.throws(() => keyFileOf(name, 'anna'), /is no account's name/, String(name));
  });
});

// The team of a person's role, in Forgejo's API as a stand-in keeps it: the organisation's teams,
// each with its members, and every call that changes one.
function forgejo(members) {
  const teams = Object.keys(members).map((name, at) => ({ id: 10 + at, name }));
  const held = Object.fromEntries(Object.entries(members).map(([name, logins]) => [teams.find((team) => team.name === name).id, new Set(logins)]));
  const changes = [];
  const call = async (method, path) => {
    const [, id, login] = /^\/teams\/(\d+)\/members\/([^/]+)$/.exec(path) ?? [];
    const team = held[id];
    if (!team) return { status: 404, body: { message: 'no such team' } };
    if (method === 'GET') return team.has(login) ? { status: 200, body: { login } } : { status: 404, body: {} };
    changes.push(`${method} ${teams.find((one) => one.id === Number(id)).name} ${login}`);
    if (method === 'PUT') team.add(login);
    else if (method === 'DELETE') team.delete(login);
    return { status: 204, body: '' };
  };
  const now = () => Object.fromEntries(teams.map(({ id, name }) => [name, [...held[id]].sort()]));
  return { teams, call, changes, now };
}

describe('putting a person in the team of their role', () => {
  test('puts them in it', async () => {
    const stand = forgejo({ Owners: ['konzilo'], admins: ['anna'], editors: [], reviewers: [] });
    await putInRoleTeam(stand.call, stand.teams, { name: 'ebba', role: 'editor', team: 'editors' });
    await putInRoleTeam(stand.call, stand.teams, { name: 'rut', role: 'reviewer', team: 'reviewers' });
    assert.deepEqual(stand.now(), { Owners: ['konzilo'], admins: ['anna'], editors: ['ebba'], reviewers: ['rut'] });
  });

  test('takes them out of the other roles\' teams, and leaves every other team and person as it was', async () => {
    const stand = forgejo({ Owners: ['konzilo'], admins: ['anna', 'rut'], editors: ['erik', 'rut'], reviewers: [], others: ['rut'] });
    await putInRoleTeam(stand.call, stand.teams, { name: 'rut', role: 'reviewer', team: 'reviewers' });
    assert.deepEqual(stand.now(), { Owners: ['konzilo'], admins: ['anna'], editors: ['erik'], reviewers: ['rut'], others: ['rut'] });
  });

  test('changes nothing that is already so', async () => {
    const stand = forgejo({ Owners: ['konzilo'], admins: ['anna'], editors: ['ebba'], reviewers: ['rut'] });
    for (const person of [{ name: 'anna', team: 'admins' }, { name: 'ebba', team: 'editors' }, { name: 'rut', team: 'reviewers' }]) await putInRoleTeam(stand.call, stand.teams, person);
    assert.deepEqual(stand.changes, []);
  });

  test('says what failed, with the person and the team, where Forgejo answers otherwise', async () => {
    const stand = forgejo({ admins: [], editors: [], reviewers: [] });
    await assert.rejects(putInRoleTeam(async () => ({ status: 500, body: 'down' }), stand.teams, { name: 'ebba', team: 'editors' }), /asking whether ebba is in admins: 500/);
    await assert.rejects(putInRoleTeam(async (method) => (method === 'GET' ? { status: 404, body: {} } : { status: 403, body: 'no' }), stand.teams, { name: 'ebba', team: 'editors' }), /putting ebba in editors: 403/);
    await assert.rejects(putInRoleTeam(stand.call, [{ id: 1, name: 'admins' }], { name: 'ebba', team: 'editors' }), /the site has no team editors/);
  });
});

// Each person's password, from a secret of their own where one is given, else the one every person shares.
test('reads a person\'s password from a file of their own first, then from the one they share', () => {
  assert.deepEqual(passwordFilesOf('ebba'), ['account-password-ebba', 'account-password']);
  assert.deepEqual(passwordFilesOf('Ebba.Holm'), ['account-password-ebba.holm', 'account-password']);
  assert.throws(() => passwordFilesOf('../instance'), /is no account's name/);
});

// Forgejo as the seed meets it, as a stand-in keeps it: its accounts, each with its password and
// the key of its second factor, null for none, and the site's teams with their members. `call` is
// its API as the instance's account, and `get` its sign-in and enrolment forms as a browser reaches
// them at `FORGEJO`, with a session's cookie: a password that is not the account's signs no one
// in, an account with a second factor is signed in only half, and the enrolment page shows a new
// key once to an account signed in whole that has none.
const FORGEJO = 'http://forgejo.test';

function forgejoWithAccounts(accounts, members = { admins: [], editors: [], reviewers: [] }) {
  const users = new Map(Object.entries(accounts).map(([name, { password, key = null }]) => [name, { password, key }]));
  const { teams, call: teamCall, now } = forgejo(members);
  const asked = [];
  const call = async (method, path, body) => {
    const user = /^\/users\/([^/]+)$/.exec(path)?.[1];
    if (method === 'GET' && user) return users.has(user) ? { status: 200, body: { login: user } } : { status: 404, body: { message: 'user does not exist' } };
    if (method === 'POST' && path === '/admin/users') {
      if (users.has(body.username)) return { status: 422, body: { message: 'user already exists' } };
      users.set(body.username, { password: body.password, key: null });
      return { status: 201, body: { login: body.username } };
    }
    return teamCall(method, path, body);
  };
  const sessions = new Map();
  let next = 0;
  const get = async (address, { method = 'GET', headers = {}, body } = {}) => {
    const { pathname } = new URL(address);
    asked.push(`${method} ${pathname}`);
    const session = sessions.get(/session=(\w+)/.exec(headers.cookie ?? '')?.[1]);
    const fields = new URLSearchParams(body ? String(body) : '');
    const page = (text) => new Response(text, { status: 200 });
    const away = (location, cookie) => new Response(null, { status: 303, headers: [['location', location], ...(cookie ? [['set-cookie', `session=${cookie}; Path=/; HttpOnly`]] : [])] });
    if (method === 'POST' && pathname === '/user/login') {
      const user = users.get(fields.get('user_name'));
      if (!user || user.password !== fields.get('password')) return page('<p>Username or password is incorrect.</p>');
      const id = `s${(next += 1)}`;
      sessions.set(id, { name: fields.get('user_name'), whole: user.key === null });
      return user.key === null ? away('/', id) : away('/user/two_factor', id);
    }
    if (pathname === '/user/settings/security/two_factor/enroll') {
      if (!session?.whole) return away('/user/login');
      const user = users.get(session.name);
      if (method === 'GET') {
        if (user.key !== null) return away('/user/settings/security');
        session.offered = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
        return page(`<p>Or enter the secret: ${session.offered}</p>`);
      }
      if (session.offered && fields.get('passcode') === totp(session.offered)) {
        user.key = session.offered;
        return away('/user/settings/security');
      }
      return page('<p>The passcode is incorrect.</p>');
    }
    return new Response('not found', { status: 404 });
  };
  return { teams, call, get, users, asked, now };
}

// The seed's state, its keys by file, and its log, as seedPeople() is handed them.
function seeding(stand, { keys = {}, passwords = {}, account = 'anna' } = {}) {
  const kept = new Map(Object.entries(keys));
  const log = [];
  return {
    kept,
    log,
    run: (people) => seedPeople(people, {
      call: stand.call,
      teams: stand.teams,
      enrol: (name, password) => enrolSecondFactor({ forgejo: FORGEJO, get: stand.get }, name, password),
      known: (file) => kept.get(file) ?? null,
      remember: (file, key) => kept.set(file, key),
      passwordOf: (name) => passwords[name] ?? 'shared-password',
      account,
      log: (line) => log.push(line),
    }),
  };
}

const anna = { name: 'anna', role: 'admin', team: 'admins' };
const ebba = { name: 'ebba', role: 'editor', team: 'editors' };
const rut = { name: 'rut', role: 'reviewer', team: 'reviewers' };

describe('seeding a local copy\'s people', () => {
  test('makes each missing account with their password, enrols it, keeps its key and puts it in its team, and changes nothing at the next start', async () => {
    const stand = forgejoWithAccounts({});
    const seed = seeding(stand, { passwords: { ebba: 'ebbas-own' } });
    await seed.run([anna, ebba]);
    assert.deepEqual([...stand.users].map(([name, { password }]) => [name, password]), [['anna', 'shared-password'], ['ebba', 'ebbas-own']]);
    assert.deepEqual(Object.fromEntries(seed.kept), { 'account-totp': stand.users.get('anna').key, 'people/ebba-totp': stand.users.get('ebba').key });
    assert.deepEqual(stand.now(), { admins: ['anna'], editors: ['ebba'], reviewers: [] });
    assert.deepEqual(seed.log, []);
    stand.asked.length = 0;
    await seed.run([anna, ebba]);
    assert.deepEqual(stand.asked, [], 'no sign-in at a start where all is so');
  });

  test('enrols an account Forgejo has already, with no key the seed keeps, where it signs in as them and they have no second factor', async () => {
    const stand = forgejoWithAccounts({ ebba: { password: 'shared-password' } });
    const seed = seeding(stand);
    await seed.run([ebba]);
    assert.ok(stand.users.get('ebba').key);
    assert.equal(seed.kept.get('people/ebba-totp'), stand.users.get('ebba').key);
    assert.deepEqual(seed.log, []);
  });

  test('goes on where an account Forgejo has already is not signed in by the password the seed has: puts them in their team, keeps no key, and says in its log what the operator can do', async () => {
    const stand = forgejoWithAccounts({ ebba: { password: 'her-own' } });
    const seed = seeding(stand);
    await seed.run([ebba, rut]);
    assert.deepEqual(stand.users.get('ebba'), { password: 'her-own', key: null }, 'the account as it is');
    assert.equal(seed.kept.has('people/ebba-totp'), false);
    assert.deepEqual(stand.now(), { admins: [], editors: ['ebba'], reviewers: ['rut'] }, 'ebba in her team, and rut seeded after her');
    assert.equal(seed.log.length, 1);
    assert.match(seed.log[0], /^seed: ebba is in Forgejo already, and the seed cannot sign in as them with the password it has, so the code command prints no code for them\b/);
    assert.match(seed.log[0], /give the seed their password as the secret account-password-ebba, or remove their account in Forgejo, and start again/);
  });

  test('goes on where an account Forgejo has already has a second factor the seed did not enrol: puts them in their team, keeps no key, and says in its log what the operator can do', async () => {
    const stand = forgejoWithAccounts({ Rut: { password: 'shared-password', key: 'MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U' } });
    const seed = seeding(stand);
    await seed.run([{ ...rut, name: 'Rut' }, ebba]);
    assert.equal(stand.users.get('Rut').key, 'MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U', 'the second factor as it is');
    assert.equal(seed.kept.has('people/rut-totp'), false);
    assert.deepEqual(stand.now(), { admins: [], editors: ['ebba'], reviewers: ['Rut'] });
    assert.equal(seed.log.length, 1);
    assert.match(seed.log[0], /^seed: Rut is in Forgejo already, and they have a second factor the seed did not enrol, whose key it cannot keep, so the code command prints no code for them\b/);
    assert.match(seed.log[0], /remove their account in Forgejo, and start again/);
  });

  test('stops where Forgejo will not enrol an account the seed has just made, naming it', async () => {
    const stand = forgejoWithAccounts({});
    const seed = seeding({ ...stand, get: async () => new Response('down', { status: 502 }) });
    await assert.rejects(seed.run([ebba]), /enrolling ebba, whose account the seed made/);
    assert.deepEqual(seed.log, []);
  });
});

