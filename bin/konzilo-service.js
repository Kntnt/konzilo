#!/usr/bin/env node
// The service (ADR 0044), one program in two roles, each a container of its own, named as its
// first argument:
//
// - `editors`: it takes Forgejo's webhook, keeps time, says how publishing stands, shows small
//   pictures of images, shows Admins and Editors the forms' submissions from the service's data,
//   mails each to its form's recipients through the adapter an Admin chooses (ADR 0003), or, in a
//   local copy, writes it to its log, forgets each once its form's retention has passed, and lets
//   an Admin find, export and erase a person's, and lists a form's revisions and the deleted
//   posts, terms and image library entries from the source history. It shows an Admin the
//   consent records, and forgets each 13 months after it was made (ADR 0049). It folds the web
//   server's log of addresses not found into the counts it keeps every five minutes, and shows
//   Admins the addresses visitors asked for in vain (ADR 0040). It shows an Admin the counts of
//   what the site's policy blocked, and forgets each 30 days after it was last seen (ADR 0051).
//   It reads the incoming feeds an Admin adds, making a post of each new item (ADR 0079). It has
//   a credential that can only read the source repository, one that can only read who is an
//   Admin, a read-only token of the instance's account, by which it reads who pushed what, and
//   the feed reader's, which writes the posts made from a feed.
// - `visitors`: it takes what visitors' browsers send below /_konzilo/, which the web server
//   passes on, such as a site's forms (ADR 0045), the records of their consent choices
//   (ADR 0049) and the policy's violation reports (ADR 0051), and keeps it in the service's data.
//   It reads the consent revision of the release in use from the releases the web server serves,
//   read-only. It reaches nothing.
//
// Each finds Forgejo and its credentials where the arrangement says, and listens on the address it
// gives, every address where it gives none (src/arrangement.js).

import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { arrangement } from '../src/arrangement.js';
import { buildControl } from '../src/build/record.js';
import { consentRetention } from '../src/service/consent-records.js';
import { deletableIn } from '../src/service/deleted.js';
import { editorsService, nextMinute } from '../src/service/editors.js';
import { feedReader } from '../src/service/feeds.js';
import { liveDescription } from '../src/service/live-description.js';
import { mailDuty } from '../src/service/mail.js';
import { mailDelivery } from '../src/service/mail-delivery.js';
import { notFoundLog } from '../src/service/not-found.js';
import { retentionDuty } from '../src/service/retention.js';
import { openStore, STORE_FILE } from '../src/service/store.js';
import { thumbnails } from '../src/service/thumbnails.js';
import { violationsDuty } from '../src/service/violations.js';
import { visitorsService } from '../src/service/visitors.js';
import { readSiteDescriptionWithoutTakenComponents, SITE_DESCRIPTION_FILE } from '../src/site-description.js';

// In the site's folder, which Compose mounts whole, so that a description replaced is seen.
const DESCRIPTION = `/site/${SITE_DESCRIPTION_FILE}`;
// The service's data, which both roles open: the role for visitors keeps the forms' submissions
// the consent records and the policy's violations there, and the role for editors shows them.
const SERVICE_DATA = '/service-data';
// The releases the web server serves, which the role for visitors reads the consent revision of
// the release in use from, read-only.
const RELEASES = '/public';

// How often the duty looks for a submission to mail, in milliseconds.
const MAIL_EVERY = 5000;
// How often the role for visitors looks whether the release in use has moved, in milliseconds,
// beside the look it takes before it decides on each consent record.
const RELEASE_LOOK_EVERY = 10_000;

// The log of addresses not found (ADR 0040): the web server's log, which it writes in a volume of
// its own that this role reads; the counts, in a volume of this role's own that no archive holds;
// and the release visitors get, which the builder writes. It is folded every five minutes.
const NOT_FOUND_LOG = '/not-found-log';
const NOT_FOUND_COUNTS = '/not-found/counts.json';
const RELEASE = '/public/current';
const FOLD_EVERY = 5 * 60_000;

const { forgejo: FORGEJO, secrets, listen } = arrangement();

// A request answered, or 500 where the service broke, which it says in its own log, with nothing
// of the request.
const serve = (service, port, options = {}) => {
  const server = createServer(options, (incoming, outgoing) => {
    service.request(incoming, outgoing).catch((error) => {
      console.error(`The service broke: ${error.stack ?? error.message}`);
      if (!outgoing.headersSent) outgoing.writeHead(500, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      outgoing.end();
    });
  });
  server.listen(port, listen ?? undefined);
  return server;
};

function editors(store) {
  const PORT = 4100;
  const { KONZILO_REPOSITORY: repository } = process.env;

  const site = readSiteDescriptionWithoutTakenComponents(DESCRIPTION);
  const collections = Object.values(site.types).map(({ collection }) => collection);
  const described = liveDescription(DESCRIPTION);

  const token = readFileSync(join(secrets, 'read-token'), 'utf8').trim();
  // The seed makes it at each start where it is missing; without it, no one is an Admin here, and
  // only the instance administrator uses the Admin's pages.
  const ROLES_TOKEN = join(secrets, 'roles-token');
  const rolesToken = existsSync(ROLES_TOKEN) ? readFileSync(ROLES_TOKEN, 'utf8').trim() : null;
  if (rolesToken === null) console.error(`The service has no ${ROLES_TOKEN}, so it cannot tell who is an Admin`);
  // The seed makes it at each start where it is missing; without it, a form's revisions name only
  // the accounts whose pushes the service's own credential is shown.
  const PUSHES_TOKEN = join(secrets, 'pushes-token');
  const pushesToken = existsSync(PUSHES_TOKEN) ? readFileSync(PUSHES_TOKEN, 'utf8').trim() : null;
  if (pushesToken === null) console.error(`The service has no ${PUSHES_TOKEN}, so it cannot tell who pushed what a private account pushed`);
  // A local copy sends no mail, and writes each to the log instead.
  const local = process.env.KONZILO_MAIL_TO_LOG === 'true';
  // The seed makes it at each start where it is missing; without it, the feed reader reads, and
  // saves nothing, which each feed's failure says.
  const FEED_TOKEN = join(secrets, 'feed-token');
  const feedToken = existsSync(FEED_TOKEN) ? readFileSync(FEED_TOKEN, 'utf8').trim() : null;
  if (feedToken === null) console.error(`The service has no ${FEED_TOKEN}, so the feed reader cannot save the posts it makes`);
  // The incoming feeds, each read at its interval; with none, nothing is read or reached. No feed
  // is read from a private address, the site's own network among them, but from a host the
  // setting names, apart by spaces, such as a stand-in on the same network (ADR 0079).
  const privateHosts = (process.env.KONZILO_FEED_PRIVATE_HOSTS ?? '').split(/[\s,]+/).filter(Boolean).map((host) => host.toLowerCase());
  const feeds = feedReader({ store, site: described, forgejo: FORGEJO, repository, token: feedToken, privateHosts });

  const notFound = notFoundLog({ log: NOT_FOUND_LOG, counts: NOT_FOUND_COUNTS, release: RELEASE });
  const fold = () => {
    try {
      notFound.fold();
    } catch (error) {
      console.error(`The log of addresses not found could not be folded: ${error.stack ?? error.message}`);
    }
  };
  fold();
  setInterval(fold, FOLD_EVERY).unref();

  const service = editorsService({
    forgejo: FORGEJO,
    repository,
    token,
    rolesToken,
    pushesToken,
    control: buildControl('/control'),
    pictures: thumbnails({ forgejo: FORGEJO, repository, token, folder: '/thumbnails' }),
    store,
    forms: () => described().forms,
    local,
    isPost: (file) => file.endsWith('.md') && collections.includes(file.split('/')[0]),
    deletable: () => deletableIn(described()),
    notFound,
    site: described,
    feeds,
  });
  serve(service, PORT);
  // The locks of tabs that have stopped answering let go, well within the two minutes ADR 0073
  // gives them.
  setInterval(() => service.sweepLocks(), 10_000).unref();

  // Each submission whose mail is due, a moment after it is kept, one look after another.
  const mail = mailDuty({ store, forms: () => described().forms, deliver: mailDelivery({ toLog: local }) });
  const mailInAMoment = () => {
    setTimeout(async () => {
      await mail.run().catch((error) => console.error(`The service's mail broke: ${error.stack ?? error.message}`));
      mailInAMoment();
    }, MAIL_EVERY);
  };
  mailInAMoment();

  // Each submission older than its form's retention, spam older than seven days, each consent
  // record older than 13 months, and each of the policy's violations last seen more than 30 days
  // ago, forgotten at the start, so that what grew too old while the service was stopped is gone,
  // and each minute.
  const retention = retentionDuty({ store });
  const consent = consentRetention({ store });
  const violations = violationsDuty({ store });
  const forgetWhatIsOld = () => {
    for (const duty of [retention, consent]) {
      try {
        duty.run();
      } catch (error) {
        console.error(`The service's retention broke: ${error.stack ?? error.message}`);
      }
    }
    try {
      violations.run();
    } catch (error) {
      console.error(`The service's forgetting of policy violations broke: ${error.stack ?? error.message}`);
    }
  };
  forgetWhatIsOld();

  const atEachMinute = () => {
    setTimeout(async () => {
      forgetWhatIsOld();
      void feeds.run().catch((error) => console.error(`The feed reader broke: ${error.stack ?? error.message}`));
      await service.tick().catch((error) => console.error(`The service's clock broke: ${error.stack ?? error.message}`));
      atEachMinute();
    }, nextMinute(Date.now()));
  };
  atEachMinute();
}

function visitors(store) {
  const PORT = 4200;
  // The public site's origin, whose host a form's page is on.
  const hosts = process.env.KONZILO_SITE_ORIGIN ? [new URL(process.env.KONZILO_SITE_ORIGIN).host] : [];
  const service = visitorsService({ site: liveDescription(DESCRIPTION), store, hosts, releases: RELEASES });
  // Each request within ten seconds (ADR 0044).
  serve(service, PORT, { requestTimeout: 10_000, headersTimeout: 10_000 });
  // The consent revision of each release that goes live, with what its pages show, kept from the
  // moment it went live, also where no record comes while it is in use (ADR 0049).
  setInterval(() => {
    try {
      service.look();
    } catch (error) {
      console.error(`The service could not keep the consent revision of the release in use: ${error.stack ?? error.message}`);
    }
  }, RELEASE_LOOK_EVERY).unref();
}

const roles = { editors, visitors };
const role = process.argv[2];
if (!Object.hasOwn(roles, role)) {
  console.error(`konzilo-service: name its role, ${Object.keys(roles).join(' or ')}`);
  process.exit(2);
}
// Either role opens the service's data once, and stops one way, its data closed first.
const store = openStore(join(SERVICE_DATA, STORE_FILE));
process.on('SIGTERM', () => {
  store.close();
  process.exit(0);
});
roles[role](store);
