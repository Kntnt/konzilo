// The body field in Sveltia: its field type and its check before a save. This module loads
// with the editor's first paint, so it holds neither Crepe, nor Sätteri, nor the rule data.

import { signedInCredential } from '../credential.js';
import { refuseAtSave } from '../refusals.js';
import { bodyControl } from './control.js';
import { imageLibrary } from './library.js';
import './open-fields.js';
import { STRUCTURE_WIDGET } from '../structure/widget.js';
import { BODY_WIDGET } from './widget.js';

export function registerBodyField(CMS, config) {
  // The host no link may lead to is this one, unless the site's address has the same name,
  // as on a local copy, where they differ only by port.
  const here = globalThis.location.hostname;
  const adminHost = new URL(config.site_url).hostname === here ? null : here;
  const bodies = new Map();
  for (const collection of config.collections) {
    const field = collection.fields?.find((one) => one.widget === BODY_WIDGET || one.widget === STRUCTURE_WIDGET);
    if (field) bodies.set(collection.name, { elements: field.elements, forms: field.forms, editable: field.editable, adminHost });
  }

  const { api_root: api, repo: repository, branch } = config.backend;
  const library = api ? imageLibrary({ api, repository, branch, credential: signedInCredential }) : null;
  CMS.registerFieldType(BODY_WIDGET, bodyControl({ adminHost, library }));
  CMS.registerEventListener({
    name: 'preSave',
    handler: async ({ entry }) => {
      const body = bodies.get(entry.get('collection'));
      if (!body) return;
      const refusal = await import('./pre-save.js').then(({ refusalOf }) => refusalOf(entry, body), (error) => {
        // The intake remains the check that counts, so a check that could not load stops nothing.
        console.warn(`The early check did not load: ${error.message}`);
        return null;
      });
      if (refusal === null) return;
      refuseAtSave(refusal);
    },
  });
}
