// The form a source file is edited in, by Sveltia's configuration (ADR 0078): a post's, a term's or
// an image library entry's in a folder collection, by its ID, the file's name, in any language's
// folder below it, and a menu's or the settings' in a file collection, by the file. It holds no
// React.

const opened = (collection, entry) => `#/collections/${encodeURIComponent(collection)}/entries/${encodeURIComponent(entry)}`;

// `collections`: Sveltia's. Gives { collection, entry, label, file, hash }, `label` the folder
// collection's or the file's, `file` whether it is a file collection's, and `hash` the editor's
// address of the form; or null for a file no form edits.
export function formOfPath(collections, path) {
  for (const collection of collections ?? []) {
    if (typeof collection.folder === 'string') {
      const prefix = `${collection.folder}/`;
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length).split('/');
      if (rest.length > 2) continue;
      const entry = rest.at(-1).replace(/\.[^.]*$/, '');
      return { collection: collection.name, entry, label: collection.label ?? collection.name, file: false, hash: opened(collection.name, entry) };
    }
    const file = (collection.files ?? []).find((one) => one.file === path);
    if (file) return { collection: collection.name, entry: file.name, label: file.label ?? file.name, file: true, hash: opened(collection.name, file.name) };
  }
  return null;
}
