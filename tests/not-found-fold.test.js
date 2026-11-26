// The log of addresses not found online (ADR 0040): the web server writes a line for each 404 it
// answers a GET or a HEAD at a public address, with the time and the path alone, and the service
// folds those lines into the counts it keeps, in a file of its own. A fold counts each line once,
// across the log's rolls; an address goes 30 days after it was last asked for, once a file or a
// rule of the release answers it, or when a purge takes it out; of more than 5,000, the least
// recently asked go first. Its page lists what is left, most asked first, but what an Admin hid
// and what a rule holds.
//
// - The fold, over a log folder, a counts file and a release folder, as Compose mounts them.

import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, test } from 'node:test';

import { ADDRESSES, KEPT } from '../src/not-found-counts.js';
import { LOG_FILE, notFoundLog } from '../src/service/not-found.js';

const NOW = 1793361600;
const DAY = 86400;

describe('the log of addresses not found', () => {
  const made = [];
  let folder;
  let log;
  let file;
  let release;
  let clock;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-not-found-fold-'));
    made.push(folder);
    log = join(folder, 'log');
    release = join(folder, 'public/current');
    mkdirSync(log, { recursive: true });
    mkdirSync(join(release, 'pages'), { recursive: true });
    mkdirSync(join(folder, 'counts'));
    file = join(folder, 'counts/counts.json');
    clock = NOW;
  });

  after(() => {
    for (const one of made) rmSync(one, { recursive: true, force: true });
  });

  const keeper = () => notFoundLog({ log, counts: file, release, now: () => clock });
  // A line as the web server writes it, its time in seconds with a fraction.
  const asked = (path, at = clock) => appendFileSync(join(log, LOG_FILE), `${JSON.stringify({ ts: at + 0.25, path })}\n`);
  const counts = () => JSON.parse(readFileSync(file, 'utf8')).addresses;
  const listed = (sourceRules) => keeper().listed({ sourceRules }).map(({ address, count }) => [address, count]);

  test('counts each address the log names, by its path, with the last time it was asked for', () => {
    for (let n = 0; n < 3; n++) asked('/nowhere/', NOW - 10 + n);
    asked('/headed/', NOW - 5);
    keeper().fold();
    assert.deepEqual(counts(), {
      '/nowhere/': { count: 3, last: NOW - 8 },
      '/headed/': { count: 1, last: NOW - 5 },
    });
  });

  test('counts each line once, from where the last fold stopped, and a line half written at the next', () => {
    asked('/nowhere/');
    keeper().fold();
    appendFileSync(join(log, LOG_FILE), `${JSON.stringify({ ts: NOW + 1, path: '/nowhere/' })}\n{"ts":${NOW + 2},"pa`);
    keeper().fold();
    assert.deepEqual(counts(), { '/nowhere/': { count: 2, last: NOW + 1 } });
    appendFileSync(join(log, LOG_FILE), 'th":"/nowhere/"}\n');
    keeper().fold();
    assert.deepEqual(counts(), { '/nowhere/': { count: 3, last: NOW + 2 } });
  });

  test('reads the rest of a file the web server rolled over, and then the new one from its start', () => {
    asked('/before/');
    keeper().fold();
    asked('/rolled/');
    renameSync(join(log, LOG_FILE), join(log, 'not-found-2026-11-25T12-00-00.000.log'));
    asked('/after/');
    keeper().fold();
    assert.deepEqual(Object.fromEntries(Object.entries(counts()).map(([path, { count }]) => [path, count])), { '/before/': 1, '/rolled/': 1, '/after/': 1 });
  });

  test('starts the file again where it is shorter than where the last fold stopped', () => {
    asked('/first/');
    asked('/first/');
    keeper().fold();
    writeFileSync(join(log, LOG_FILE), '');
    asked('/again/');
    keeper().fold();
    assert.deepEqual(Object.keys(counts()).sort(), ['/again/', '/first/']);
  });

  test('counts nothing a line holds besides a path, or a path it would not count', () => {
    const lines = [
      { ts: NOW, path: '/with/?query=1' },
      { ts: NOW, path: `/${'a'.repeat(300)}` },
      { ts: NOW, path: '/_konzilo/forms/x' },
      { ts: NOW, path: 'http://elsewhere.example/x' },
      { ts: 'now', path: '/no-time/' },
      { path: '/no-time/' },
      'not json',
    ];
    writeFileSync(join(log, LOG_FILE), lines.map((line) => `${typeof line === 'string' ? line : JSON.stringify(line)}\n`).join(''));
    keeper().fold();
    assert.deepEqual(counts(), {});
  });

  test('lets an address go 30 days after it was last asked for, and keeps one an Admin hid as hidden', () => {
    writeFileSync(file, JSON.stringify({ addresses: { '/stale/': { count: 4, last: NOW - KEPT - 1 }, '/fresh/': { count: 2, last: NOW - 3 * DAY, hidden: true } } }));
    asked('/fresh/');
    keeper().fold();
    assert.deepEqual(counts(), { '/fresh/': { count: 3, last: NOW, hidden: true } });
  });

  test('keeps 5,000 addresses and lets the least recently asked go first', () => {
    const many = Object.fromEntries(Array.from({ length: ADDRESSES }, (_, n) => [`/a-${n}/`, { count: 1, last: NOW - 10_000 + n }]));
    writeFileSync(file, JSON.stringify({ addresses: many }));
    asked('/new/');
    keeper().fold();
    const left = counts();
    assert.equal(Object.keys(left).length, ADDRESSES);
    assert.ok(!('/a-0/' in left) && '/a-1/' in left && '/new/' in left);
  });

  test('lets an address go once a file of the release holds it', () => {
    for (const path of ['/page/', '/page', '/file.txt', '/caf%C3%A9/', '/feed/', '/still-missing/']) asked(path);
    mkdirSync(join(release, 'pages/page'), { recursive: true });
    writeFileSync(join(release, 'pages/page/index.html'), 'a page');
    writeFileSync(join(release, 'pages/file.txt'), 'a file');
    mkdirSync(join(release, 'pages/café'), { recursive: true });
    writeFileSync(join(release, 'pages/café/index.html'), 'a page');
    mkdirSync(join(release, 'pages/feed'), { recursive: true });
    writeFileSync(join(release, 'pages/feed/index.rss'), 'a feed');
    keeper().fold();
    assert.deepEqual(Object.keys(counts()), ['/still-missing/']);
  });

  test('never looks outside the release\'s pages for a file that holds an address', () => {
    writeFileSync(join(release, 'outside.txt'), 'not a page');
    for (const path of ['/../outside.txt', '/%2E%2E/outside.txt', '/..%2Foutside.txt']) asked(path);
    keeper().fold();
    assert.equal(Object.keys(counts()).length, 3);
  });

  test('lets an address go once a rule of the release answers it otherwise, and counts on one it answers 404', () => {
    for (const path of ['/moved', '/gone/', '/old/thing', '/missing/', '/kept/', '/queried/']) asked(path);
    writeFileSync(join(release, '_redirects'), ['/gone/ 410', '/missing/ 404', '/moved/ /first/ 301', '/queried/?a=1 /first/ 301', '^/old/(.*) /new/$1 301', ''].join('\n'));
    keeper().fold();
    assert.deepEqual(Object.keys(counts()).sort(), ['/kept/', '/missing/', '/queried/']);
  });

  test('takes a purged post\'s addresses out, with and without their last slash', () => {
    for (const path of ['/purged/', '/purged', '/caf%C3%A9/', '/other/']) asked(path);
    keeper().fold();
    assert.equal(keeper().forget(['/purged/', '/café/']), 3);
    assert.deepEqual(Object.keys(counts()), ['/other/']);
  });

  test('lists what it counts, most asked first, but what an Admin hid and what a rule holds', () => {
    for (const [path, times] of [['/most/', 3], ['/some/', 2], ['/hidden/', 4], ['/ruled/', 5], ['/released-404/', 6], ['/patterned/x', 7], ['/once/', 1]]) {
      for (let n = 0; n < times; n++) asked(path);
    }
    keeper().fold();
    keeper().hide('/hidden/');
    writeFileSync(join(release, '_redirects'), '/released-404/ 404\n');
    const sourceRules = [{ from: '/ruled/', to: '/most/', status: 301 }, { from: '^/patterned/.*', status: '410' }, { from: '/some/?a=1', status: 410 }];
    assert.deepEqual(listed(sourceRules), [['/most/', 3], ['/some/', 2], ['/once/', 1]]);
    assert.equal(counts()['/hidden/'].hidden, true);
    assert.deepEqual(keeper().listed().map(({ address }) => address), ['/patterned/x', '/ruled/', '/most/', '/some/', '/once/']);
  });

  test('lists each address with how often and when it was last asked for, after a fold of what is new', () => {
    asked('/new/', NOW - 60);
    const [entry] = keeper().listed();
    assert.deepEqual(entry, { address: '/new/', count: 1, last: new Date((NOW - 60) * 1000).toISOString() });
  });

  test('hides only an address it counts, and goes on counting it', () => {
    asked('/hidden/');
    keeper().fold();
    assert.equal(keeper().hide('/hidden/'), true);
    assert.equal(keeper().hide('/never-asked/'), false);
    asked('/hidden/');
    keeper().fold();
    assert.deepEqual(counts(), { '/hidden/': { count: 2, last: NOW, hidden: true } });
  });
});
