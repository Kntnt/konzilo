// The authors field in Sveltia, in place of a relation, which keeps no order an editor gives
// (field.js). It loads when an entry opens, and reads the authors from the repository with the
// credential of whoever is signed in; with no repository to ask, it shows the IDs it holds.
//
// The field's setting in the configuration: `folder`, where the authors' files are, in the main
// language's folder on a site in several.

import { signedInCredential } from '../credential.js';
import { authorsIn } from './terms.js';
import { AUTHORS_WIDGET } from './widget.js';

export { AUTHORS_WIDGET };

const plainValue = (value) => (value?.toJS ? value.toJS() : value);

export function registerAuthorsField(CMS, config) {
  const { api_root: api, repo: repository, branch = 'main' } = config.backend;
  // One for each folder while the page is open, so that each file is read once.
  const readers = new Map();
  const readerOf = (folder) => {
    if (!api) return null;
    if (!readers.has(folder)) readers.set(folder, authorsIn({ api, repository, branch, folder, credential: signedInCredential }));
    return readers.get(folder);
  };

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
          value: plainValue(latest.current.value),
          changed: (next) => latest.current.onChange(next),
          authors: readerOf(plainValue(field.get('folder'))),
          label: plainValue(field.get('label')) ?? '',
          forID,
        });
      });
      return () => {
        gone = true;
        live.current?.destroy();
      };
    }, []);
    React.useEffect(() => {
      live.current?.setValue(plainValue(value));
    }, [value]);
    return React.createElement('div', { ref: host, className: 'konzilo-authors-host' });
  });
}
