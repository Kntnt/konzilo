// The aspect ratios a site's design names for the contexts it draws images in, for the frames an
// editor places an image's focal point by (ADR 0022, image/frames.js). The design hands them to
// konzilo({ images }) in the site's Astro configuration, which the integration it returns keeps as
// `imageContexts`, so they are read where the site's code is installed, as the editor's
// configuration is written (bin/konzilo-cms.js), by loading that configuration as Astro does.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { INTEGRATION_NAME } from './astro/integration-name.js';

// The names Astro looks for its configuration under, in its order, but for TypeScript's, which
// Node reads too.
const CONFIG_FILES = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.mts'];

// Each context's ratio that the site's design in `site`, its folder, names, { card: '1:1' }; none
// for a site without one, or whose configuration cannot be read, which `warn(message)` is told,
// since the site's build would say more.
export async function designRatios(site, warn = (message) => console.warn(message)) {
  const name = CONFIG_FILES.find((one) => existsSync(join(site, one)));
  if (name === undefined) return {};
  let config;
  try {
    ({ default: config } = await import(pathToFileURL(join(site, name)).href));
  } catch (error) {
    warn(`Konzilo could not read the aspect ratios of the site's design from ${name}: ${error.message}`);
    return {};
  }
  const integrations = [config?.integrations ?? []].flat(Number.POSITIVE_INFINITY);
  const contexts = integrations.find((one) => one?.name === INTEGRATION_NAME)?.imageContexts ?? {};
  return Object.fromEntries(Object.entries(contexts).filter(([, context]) => typeof context?.ratio === 'string').map(([context, { ratio }]) => [context, ratio]));
}
