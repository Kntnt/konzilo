// The Astro configuration of a throwaway site repository in this suite, with
// Konzilo's integration, and the environment its builds run in.
//
// Each such repository links node_modules to the core's, so Astro's default
// cache, node_modules/.astro, would be one folder for every build the suite
// runs, the content layer's data store in it among them: builds that run at
// once, as the test runner runs the files, then read and write each other's
// content, and a page goes missing now and then. Vite's cache of optimised
// dependencies, node_modules/.vite, is shared the same way: dev servers that
// start at once on an empty cache write over each other's work, and one may
// never answer. Each repository keeps both caches in itself, in CACHE_DIR.

export const CACHE_DIR = '.astro-cache';

// The public host every build of the suite is made for.
export const ORIGIN = 'https://www.example.com';

// The environment Astro runs in: never reported anywhere, and building for
// ORIGIN. A dev server looks for a new version as it starts, and writes that it
// has in .astro/settings.json, and it counts on being told of that once. macOS
// can tell it twice, and the second time it restarts, which at that moment leaves
// a server that never answers.
export const astroEnvironment = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', ASTRO_DISABLE_UPDATE_CHECK: 'true', KONZILO_ORIGIN: ORIGIN };

// `integration`: the path of Konzilo's Astro integration in the core;
// `options`: the integration's options, as the site's configuration gives
// them, if any.
export function astroConfig(integration, options) {
  const given = options === undefined ? '' : JSON.stringify(options);
  return `import konzilo from ${JSON.stringify(integration)};\n\nexport default { cacheDir: './${CACHE_DIR}', vite: { cacheDir: './${CACHE_DIR}/vite' }, integrations: [konzilo(${given})] };\n`;
}
