// The site's own check of what its components hold: the module its site description
// names under `componentChecks`, read from the site repository. Its export
// `componentProblems(name, attributes, blocks)` gives, for one of the site's components,
// the reasons the site cannot publish what it holds, in words an editor reads: `name` the
// directive's, `attributes` its values as written, and `blocks` the body check's model of
// a container's blocks (format/body.js). The intake refuses the post for each reason.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The check for the body's hands, or null for a site that names none. Throws when the
// module cannot be read or has no such function, since a check that is not there would
// let through what the site means to refuse.
export async function componentChecksOf(site, folder) {
  if (!site.componentChecks) return null;
  const file = join(folder, site.componentChecks);
  let module;
  try {
    module = await import(pathToFileURL(file).href);
  } catch (error) {
    throw new Error(`the site's componentChecks, ${site.componentChecks}, cannot be read: ${error.message}`);
  }
  const check = module.componentProblems;
  if (typeof check !== 'function') throw new Error(`the site's componentChecks, ${site.componentChecks}, exports no function componentProblems(name, attributes, blocks)`);
  return (name, attributes, blocks) => {
    if (!Object.hasOwn(site.components, name)) return [];
    const reasons = check(name, attributes, blocks);
    if (!Array.isArray(reasons) || !reasons.every((reason) => typeof reason === 'string')) {
      throw new Error(`the site's componentProblems() gives no list of reasons for ${name}`);
    }
    return reasons;
  };
}
