// A local copy's people (ADR 0007, ADR 0008): the setting that lists them with their roles, the
// one Admin of KONZILO_ACCOUNT where it lists none, where each person's password is read from and
// their key kept, and how the seed puts each in the team of their role.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { keyFileOf, passwordFilesOf, peopleOf, seat } from '../src/people.js';

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

// Each person's key, in `state`: the one account's where a local copy has always kept it, so that
// a copy seeded before goes on as it did, and every other person's in a folder of their own, apart
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

describe('seating a person', () => {
  test('puts them in the team of their role', async () => {
    const stand = forgejo({ Owners: ['konzilo'], admins: ['anna'], editors: [], reviewers: [] });
    await seat(stand.call, stand.teams, { name: 'ebba', role: 'editor', team: 'editors' });
    await seat(stand.call, stand.teams, { name: 'rut', role: 'reviewer', team: 'reviewers' });
    assert.deepEqual(stand.now(), { Owners: ['konzilo'], admins: ['anna'], editors: ['ebba'], reviewers: ['rut'] });
  });

  test('takes them out of the other roles\' teams, and leaves every other team and person as it was', async () => {
    const stand = forgejo({ Owners: ['konzilo'], admins: ['anna', 'rut'], editors: ['erik', 'rut'], reviewers: [], others: ['rut'] });
    await seat(stand.call, stand.teams, { name: 'rut', role: 'reviewer', team: 'reviewers' });
    assert.deepEqual(stand.now(), { Owners: ['konzilo'], admins: ['anna'], editors: ['erik'], reviewers: ['rut'], others: ['rut'] });
  });

  test('changes nothing that is already so', async () => {
    const stand = forgejo({ Owners: ['konzilo'], admins: ['anna'], editors: ['ebba'], reviewers: ['rut'] });
    for (const person of [{ name: 'anna', team: 'admins' }, { name: 'ebba', team: 'editors' }, { name: 'rut', team: 'reviewers' }]) await seat(stand.call, stand.teams, person);
    assert.deepEqual(stand.changes, []);
  });

  test('says what failed, with the person and the team, where Forgejo answers otherwise', async () => {
    const stand = forgejo({ admins: [], editors: [], reviewers: [] });
    await assert.rejects(seat(async () => ({ status: 500, body: 'down' }), stand.teams, { name: 'ebba', team: 'editors' }), /asking whether ebba is in admins: 500/);
    await assert.rejects(seat(async (method) => (method === 'GET' ? { status: 404, body: {} } : { status: 403, body: 'no' }), stand.teams, { name: 'ebba', team: 'editors' }), /putting ebba in editors: 403/);
    await assert.rejects(seat(stand.call, [{ id: 1, name: 'admins' }], { name: 'ebba', team: 'editors' }), /the site has no team editors/);
  });
});

// Each person's password, from a secret of their own where one is given, else the one of today.
test('reads a person\'s password from a file of their own first, then from the one they share', () => {
  assert.deepEqual(passwordFilesOf('ebba'), ['account-password-ebba', 'account-password']);
  assert.deepEqual(passwordFilesOf('Ebba.Holm'), ['account-password-ebba.holm', 'account-password']);
  assert.throws(() => passwordFilesOf('../instance'), /is no account's name/);
});
