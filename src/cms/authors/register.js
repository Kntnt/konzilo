// The authors field in Sveltia, in place of a relation, which keeps no order an editor gives
// (field.js). It loads when an entry opens, and reads the authors from the repository with the
// credential of whoever is signed in; with no repository to ask, it shows the IDs it holds.
//
// The field's setting in the configuration: `folder`, where the authors' files are, in the main
// language's folder on a site in several.

import { signedInCredential } from '../credential.js';
import { plain } from '../plain.js';
import { authorsIn } from './terms.js';
import { AUTHORS_WIDGET, ESCAPE_EVENT } from './widget.js';

export { AUTHORS_WIDGET };

export function registerAuthorsField(CMS, config) {
  const { api_root: api, repo: repository, branch = 'main' } = config.backend;
  // One for each folder while the page is open, so that each file is read once.
  const readers = new Map();
  const readerOf = (folder) => {
    if (!api) return null;
    if (!readers.has(folder)) readers.set(folder, authorsIn({ api, repository, branch, folder, credential: signedInCredential }));
    return readers.get(folder);
  };

  // Sveltia leaves the entry at an Escape, which it hears on the window before anything on the
  // page does. Heard here first, since this is set before Sveltia starts, an Escape is the box's
  // while it has a list to close or a name to clear (field.js), and Sveltia's otherwise.
  globalThis.addEventListener('keydown', (event) => {
    const box = event.target;
    if (event.key !== 'Escape' || !box?.matches?.('.konzilo-authors-input')) return;
    if (box.getAttribute('aria-expanded') !== 'true' && box.value === '') return;
    event.stopImmediatePropagation();
    event.preventDefault();
    box.dispatchEvent(new CustomEvent(ESCAPE_EVENT));
  }, { capture: true });

  CMS.registerFieldType(AUTHORS_WIDGET, function KonziloAuthors({ value, onChange, field, forID }) {
    const React = window.__SVELTIA_CMS_REACT__;
    const host = React.useRef(null);
    const live = React.useRef(null);
    const latest = React.useRef({ onChange, value });
    latest.current = { onChange, value };
    React.useEffect(() => {
      let gone = false;
      void import('./field.js').then(({ mountAuthorsField }) => {
        if (gone) return;
        // The field takes a moment to load, and the value may have changed meanwhile.
        live.current = mountAuthorsField(host.current, {
          value: plain(latest.current.value),
          changed: (next) => latest.current.onChange(next),
          authors: readerOf(plain(field.get('folder'))),
          label: plain(field.get('label')) ?? '',
          forID,
        });
      });
      return () => {
        gone = true;
        live.current?.destroy();
      };
    }, []);
    React.useEffect(() => {
      live.current?.setValue(plain(value));
    }, [value]);
    return React.createElement('div', { ref: host, className: 'konzilo-authors-host' });
  });
}
