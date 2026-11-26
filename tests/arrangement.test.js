// Where each of a site's programs finds its peers and its own folders (ADR 0002): settings, each
// with what Compose arranges as its default, so that Compose sets none of them, while a hosting
// layer or a site may arrange the same programs otherwise.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { arrangement, commandTimeLimit } from '../src/arrangement.js';

test('gives what Compose arranges where nothing is set', () => {
  assert.deepEqual(arrangement({}), {
    forgejo: 'http://forgejo:3000',
    typesense: 'http://typesense:8108',
    editors: 'http://editors:4100',
    visitors: 'http://visitors:4200',
    preview: 'http://127.0.0.1:4000',
    secrets: '/secret',
    work: '/work',
    listen: null,
  });
  assert.equal(commandTimeLimit({}), 600_000);
});

// One container, say, with every peer on the loopback and each program's folders of its own.
test('takes each setting where it is given, and leaves the others as they were', () => {
  const compose = arrangement({});
  for (const [name, value, key] of [
    ['KONZILO_PEER_FORGEJO', 'http://127.0.0.1:3000', 'forgejo'],
    ['KONZILO_PEER_TYPESENSE', 'http://127.0.0.1:8108', 'typesense'],
    ['KONZILO_PEER_EDITORS', 'http://127.0.0.1:4100', 'editors'],
    ['KONZILO_PEER_VISITORS', 'http://127.0.0.1:4200', 'visitors'],
    ['KONZILO_PEER_PREVIEW', 'https://preview.internal:8443', 'preview'],
    ['KONZILO_FOLDER_SECRET', '/builder-secret', 'secrets'],
    ['KONZILO_FOLDER_WORK', '/var/lib/konzilo/builder-work', 'work'],
    ['KONZILO_LISTEN', '127.0.0.1', 'listen'],
  ]) {
    assert.deepEqual(arrangement({ [name]: value }), { ...compose, [key]: value }, name);
  }
});

// How long the builder waits for a command of a build before it stops it (ADR 0031), in whole
// seconds or minutes, as ten minutes is said by default.
test('takes the builder\'s time limit in whole seconds or minutes', () => {
  for (const [value, limit] of [['90s', 90_000], ['1s', 1_000], ['15m', 900_000], ['1m', 60_000], ['600s', 600_000]]) {
    assert.equal(commandTimeLimit({ KONZILO_COMMAND_TIME_LIMIT: value }), limit, value);
  }
});

// A limit the builder cannot keep would stop every command at once, or never.
test('refuses a time limit that is not a positive whole number of seconds or minutes, naming the setting', () => {
  for (const value of ['10', '0m', '0s', '-5m', '1.5m', '10 m', '10min', '1h', 'm', 'ten minutes', '99999999m']) {
    assert.throws(() => commandTimeLimit({ KONZILO_COMMAND_TIME_LIMIT: value }), /^Error: KONZILO_COMMAND_TIME_LIMIT is ".*", which is no whole number of seconds or minutes the builder can wait, such as 10m or 90s$/, value);
  }
});

// Only the builder waits for a command, so only the builder reads the limit, and the service
// and the live preview, which read the same arrangement, start whatever it holds.
test('leaves the time limit to the builder, so that the service and the preview start with one it refuses', () => {
  assert.deepEqual(arrangement({ KONZILO_COMMAND_TIME_LIMIT: 'ten minutes' }), arrangement({}));
});

test('reads an empty setting as none, as Compose reads one', () => {
  assert.deepEqual(arrangement({ KONZILO_PEER_FORGEJO: '', KONZILO_FOLDER_WORK: '', KONZILO_LISTEN: '' }), arrangement({}));
  assert.equal(commandTimeLimit({ KONZILO_COMMAND_TIME_LIMIT: '' }), commandTimeLimit({}));
});

// A peer's address goes into addresses, a Git remote and the web server's configuration, which
// takes an origin and nothing more, and a folder is joined to the names in it.
test('refuses a peer that is not an origin, and a folder that is not absolute, naming the setting', () => {
  for (const [name, value] of [
    ['KONZILO_PEER_FORGEJO', 'forgejo:3000'],
    ['KONZILO_PEER_FORGEJO', 'http://forgejo:3000/'],
    ['KONZILO_PEER_TYPESENSE', 'http://typesense:8108/collections'],
    ['KONZILO_PEER_EDITORS', 'ftp://editors:4100'],
    ['KONZILO_PEER_VISITORS', 'http://someone:secret@visitors:4200'],
    ['KONZILO_PEER_PREVIEW', 'http://127.0.0.1:4000?x'],
    ['KONZILO_PEER_PREVIEW', 'http://127.0.0.1 :4000'],
    ['KONZILO_FOLDER_SECRET', 'secret'],
    ['KONZILO_FOLDER_WORK', './work'],
  ]) {
    assert.throws(() => arrangement({ [name]: value }), new RegExp(name), `${name}=${value}`);
  }
  assert.equal(arrangement({ KONZILO_PEER_FORGEJO: 'http://[::1]:3000' }).forgejo, 'http://[::1]:3000');
});

test('reads the environment it runs in where it is given none', () => {
  const before = process.env.KONZILO_PEER_TYPESENSE;
  process.env.KONZILO_PEER_TYPESENSE = 'http://127.0.0.1:8108';
  try {
    assert.equal(arrangement().typesense, 'http://127.0.0.1:8108');
  } finally {
    if (before === undefined) delete process.env.KONZILO_PEER_TYPESENSE;
    else process.env.KONZILO_PEER_TYPESENSE = before;
  }
});
