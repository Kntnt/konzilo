// The body field as Sveltia's custom field type: a small React control, which loads the field
// when an entry opens, so that Sveltia's first paint pays for neither Crepe nor Sätteri.
//
// Crossing Sveltia's responsive breakpoint remounts a control. The field is kept across that,
// by its entry and name, so that a remount changes nothing and the editor keeps its undo.

const KEEP_FOR = 2000;
const kept = new Map();

const plain = (value) => (value?.toJS ? value.toJS() : value);

// A control's ID changes with each mount, and its props do not say which language it is in, so
// a field is found again by its entry, its name and the value it holds. Two languages with one
// value can only be told apart by their undo, which a person would not miss across a remount.
const keyOf = (field, entry, value) => [entry?.get?.('collection'), entry?.get?.('slug'), field.get('name'), value ?? ''].join('|');

export function bodyControl({ adminHost }) {
  return function KonziloBody(props) {
    const React = window.__SVELTIA_CMS_REACT__;
    const { value, onChange, field, entry, forID } = props;
    const host = React.useRef(null);
    const live = React.useRef(null);
    const latest = React.useRef(onChange);
    latest.current = onChange;

    React.useEffect(() => {
      const held = kept.get(keyOf(field, entry, value));
      if (held) {
        clearTimeout(held.timer);
        kept.delete(held.key);
        host.current.append(held.field.frame);
        live.current = held.field;
        held.setChanged((next) => latest.current(next));
      } else {
        let changedTo = (next) => latest.current(next);
        void import('./field.js').then(({ mountBodyField }) => {
          if (host.current === null) return;
          const made = mountBodyField(host.current, {
            value,
            changed: (next) => changedTo(next),
            elements: plain(field.get('elements')) ?? [],
            forms: plain(field.get('forms')) ?? [],
            adminHost,
          });
          made.setChanged = (to) => {
            changedTo = to;
          };
          live.current = made;
        });
      }
      return () => {
        const leaving = live.current;
        live.current = null;
        if (!leaving) return;
        leaving.flush();
        leaving.frame.remove();
        const key = keyOf(field, entry, leaving.value);
        const timer = setTimeout(() => {
          if (kept.get(key)?.field === leaving) kept.delete(key);
          leaving.destroy();
        }, KEEP_FOR);
        kept.set(key, { key, field: leaving, timer, setChanged: leaving.setChanged });
      };
    }, []);

    React.useEffect(() => {
      live.current?.setValue(value);
    }, [value]);

    return React.createElement('div', { ref: host, id: forID, className: 'konzilo-body-host' });
  };
}
