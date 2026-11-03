#!/usr/bin/env node
// Copy the core's fictional demo content into the site's content folder, when
// the site has none, so that a fresh clone of a site repository has something
// to build and to design with. A site that has a content folder keeps it as it
// is. Builds run this too, so a public host with no content is refused: no live
// site may show fictional posts.

import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const demo = fileURLToPath(new URL('../site-template/demo-content/', import.meta.url));
const content = resolve(process.env.KONZILO_CONTENT ?? 'content');

const origin = process.env.KONZILO_ORIGIN;
const local = origin === undefined || /^http:\/\/localhost(?::\d+)?$/.test(origin);

if (!existsSync(content)) {
  if (!local) {
    console.error(`konzilo: no content in ${content}, and demo content is not for a public host: ${origin}`);
    process.exit(1);
  }
  cpSync(demo, content, { recursive: true });
  console.log(`konzilo: copied the demo content into ${content}`);
}
