// The structure field in Sveltia: the body of a type that chooses it (`"editor": "structure"` in
// the site description), as a tree of its levels. The field itself loads when an entry opens.

import { signedInCredential } from '../credential.js';
import { imageLibrary } from '../body/library.js';
import { STRUCTURE_WIDGET } from './widget.js';
import { plain } from '../plain.js';

export function registerStructureField(CMS, config) {
  const { api_root: api, repo: repository, branch } = config.backend;
  const library = api ? imageLibrary({ api, repository, branch, credential: signedInCredential }) : null;
  const adminHost = new URL(config.site_url).hostname === globalThis.location.hostname ? null : globalThis.location.hostname;

  CMS.registerFieldType(STRUCTURE_WIDGET, function KonziloStructure({ value, onChange, entry, forID, field }) {
    const React = globalThis.__SVELTIA_CMS_REACT__;
    const host = React.useRef(null);
    const live = React.useRef(null);
    const latest = React.useRef(onChange);
    latest.current = onChange;
    React.useEffect(() => {
      let gone = false;
      void import('./field.js').then(({ mountStructureField }) => {
        if (gone) return;
        live.current = mountStructureField(host.current, {
          value,
          changed: (next) => latest.current(next),
          key: `${entry?.get?.('collection')}/${entry?.get?.('slug')}`,
          forms: plain(field.get('forms')) ?? [],
          editable: plain(field.get('editable')) ?? {},
          elements: plain(field.get('elements')) ?? [],
          adminHost,
          library,
        });
      });
      return () => {
        gone = true;
        live.current?.destroy();
      };
    }, []);
    React.useEffect(() => {
      live.current?.setValue(value);
    }, [value]);
    return React.createElement('div', { ref: host, id: forID, className: 'konzilo-tree-host' });
  });
}
