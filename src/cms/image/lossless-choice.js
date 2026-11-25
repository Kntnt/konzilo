// The image library entry's *Lossless compression* (ADR 0063), between the two fields of its form
// that share it. The checkbox is drawn by the entry's file field, since it decides how the file
// chosen there is converted, but a field writes only its own value, so a field of its own, which
// draws nothing, writes it into the entry as `lossless`. The file field tells what was chosen once
// the file is converted, so that the entry never says other than its file. One entry's form is
// open at a time.

const watchers = new Set();

export const losslessChoice = {
  tell(lossless) {
    for (const watcher of watchers) watcher(lossless === true);
  },
  watch(watcher) {
    watchers.add(watcher);
    return () => watchers.delete(watcher);
  },
};
