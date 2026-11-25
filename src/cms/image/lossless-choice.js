// What an image library entry's file field tells the entry's other fields of the file chosen, since
// a field writes only its own value. One entry's form is open at a time.
//
// *Lossless compression* (ADR 0063) is drawn by the file field, since it decides how the file chosen
// there is converted, and a field of its own, which draws nothing, writes it into the entry as
// `lossless`. The file field tells what was chosen once the file is converted, so that the entry
// never says other than its file.
//
// *Display width* (ADR 0055) is a field of its own, which an editor may change at any time. The
// file field tells it the width a file's name gives, `@2x` or `@3x`, or null for any other, once
// the file is added, and the editor may change it after.

function told() {
  const watchers = new Set();
  return {
    tell(value) {
      for (const watcher of watchers) watcher(value);
    },
    watch(watcher) {
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
  };
}

const lossless = told();

export const losslessChoice = {
  tell: (chosen) => lossless.tell(chosen === true),
  watch: lossless.watch,
};

export const displayWidthChoice = told();
