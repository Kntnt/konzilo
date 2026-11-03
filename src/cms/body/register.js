// The body field in Sveltia: its field type and its check before a save. This module loads
// with the editor's first paint, so it holds neither Crepe, nor Sätteri, nor the rule data.

import { bodyControl } from './control.js';
import './open-fields.js';
import { say } from './texts.js';
import { BODY_WIDGET } from './widget.js';

// Sveltia's dialog shows these words above a refusal. It tells a refusal from a failure by
// the reason itself, which only the handler below made (patches.json).
let lastRefusal = null;
globalThis.__KONZILO_REFUSAL_WORDS__ = (shown) => (lastRefusal !== null && shown === lastRefusal ? say('refused') : undefined);

export function registerBodyField(CMS, config) {
  // The host no link may lead to is this one, unless the site's address has the same name,
  // as on a local copy, where they differ only by port.
  const here = globalThis.location.hostname;
  const adminHost = new URL(config.site_url).hostname === here ? null : here;
  const bodies = new Map();
  for (const collection of config.collections) {
    const field = collection.fields?.find((one) => one.widget === BODY_WIDGET);
    if (field) bodies.set(collection.name, { elements: field.elements, forms: field.forms, adminHost });
  }

  CMS.registerFieldType(BODY_WIDGET, bodyControl({ adminHost }));
  CMS.registerEventListener({
    name: 'preSave',
    handler: async ({ entry }) => {
      const body = bodies.get(entry.get('collection'));
      if (!body) return;
      const { refusalOf } = await import('./pre-save.js');
      const refusal = await refusalOf(entry, body);
      if (refusal === null) return;
      lastRefusal = refusal;
      throw new Error(refusal);
    },
  });
}
