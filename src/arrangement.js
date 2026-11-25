// Where each of a site's programs finds its peers and its own folders (ADR 0002), and how long the
// builder waits for a command of a build (ADR 0031): settings, each with what Compose arranges as
// its default, so that Compose sets none of them, while a hosting layer or a site may arrange the
// same programs otherwise, on other machines or several in one container. compose/README.md lists
// them, under What another arrangement sets.

import { posix } from 'node:path';

// Each setting by its name, with its default: a peer address, where a program reaches Forgejo,
// Typesense, the service's two roles or the live preview inside the site's network, as an origin;
// a program's own folders; the address the service's roles listen on, every address where none is
// given; and how long the builder waits for the intake, the site's build or its search documents
// before it stops it, in whole seconds or minutes.
export const ARRANGEMENT = Object.freeze({
  KONZILO_PEER_FORGEJO: 'http://forgejo:3000',
  KONZILO_PEER_TYPESENSE: 'http://typesense:8108',
  KONZILO_PEER_EDITORS: 'http://editors:4100',
  KONZILO_PEER_VISITORS: 'http://visitors:4200',
  KONZILO_PEER_PREVIEW: 'http://127.0.0.1:4000',
  KONZILO_FOLDER_SECRET: '/secret',
  KONZILO_FOLDER_WORK: '/work',
  KONZILO_LISTEN: null,
  KONZILO_COMMAND_TIME_LIMIT: '10m',
});

// An origin and nothing more, as the web server takes an upstream: a scheme, a host and a port.
const ORIGIN = /^https?:\/\/[^/?#@\s]+$/;

const peer = (name, value) => {
  if (!ORIGIN.test(value) || !URL.canParse(value)) throw new Error(`${name} is "${value}", which is no origin, such as ${ARRANGEMENT[name]}`);
  return value;
};

const folder = (name, value) => {
  if (!posix.isAbsolute(value)) throw new Error(`${name} is "${value}", which is no absolute folder, such as ${ARRANGEMENT[name]}`);
  return value;
};

// A time limit in milliseconds, from whole seconds or minutes, such as 90s or 10m. A timer holds no
// more than 2^31 - 1 milliseconds, and one set longer runs out at once.
const LONGEST = 2 ** 31 - 1;
const timeLimit = (name, value) => {
  const [, count, unit] = /^([1-9]\d*)([sm])$/.exec(value) ?? [];
  const limit = count === undefined ? NaN : Number(count) * (unit === 'm' ? 60_000 : 1_000);
  if (!(limit <= LONGEST)) throw new Error(`${name} is "${value}", which is no whole number of seconds or minutes the builder can wait, such as ${ARRANGEMENT[name]} or 90s`);
  return limit;
};

// The settings as `environment` gives them, each in its default's place where it gives none or
// an empty one. Throws, naming the setting, where one is not what it may be.
export function arrangement(environment = process.env) {
  const setting = (name) => environment[name] || ARRANGEMENT[name];
  return {
    forgejo: peer('KONZILO_PEER_FORGEJO', setting('KONZILO_PEER_FORGEJO')),
    typesense: peer('KONZILO_PEER_TYPESENSE', setting('KONZILO_PEER_TYPESENSE')),
    editors: peer('KONZILO_PEER_EDITORS', setting('KONZILO_PEER_EDITORS')),
    visitors: peer('KONZILO_PEER_VISITORS', setting('KONZILO_PEER_VISITORS')),
    preview: peer('KONZILO_PEER_PREVIEW', setting('KONZILO_PEER_PREVIEW')),
    secrets: folder('KONZILO_FOLDER_SECRET', setting('KONZILO_FOLDER_SECRET')),
    work: folder('KONZILO_FOLDER_WORK', setting('KONZILO_FOLDER_WORK')),
    listen: setting('KONZILO_LISTEN'),
    commandTimeLimit: timeLimit('KONZILO_COMMAND_TIME_LIMIT', setting('KONZILO_COMMAND_TIME_LIMIT')),
  };
}
