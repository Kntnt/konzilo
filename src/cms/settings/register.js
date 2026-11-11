// The core's field for a setting with a default (ADR 0033): Sveltia's own field for the setting,
// a switch, a number, a choice or a text, drawn through `CMS.getFieldType`, which shows the
// setting's default while the settings file holds no value, and leaves the file with none when the
// default is chosen again (value.js).
//
// Sveltia gives a field's default to an existing file only where the file holds the setting's
// group, and then writes it into the file at the next save; where the file lacks the group, it shows
// a switch off and a number empty. So the setting is given no default of its own in the
// configuration (config.js), and its field's settings are:
//   field: {...}   Sveltia's field for the setting, as it would be declared, with its `default`
// A setting nobody touches keeps no value, so a save leaves it out of the file, and a closed bar
// with nothing else in it stays closed.

import { plain } from '../plain.js';
import { keptValue, shownValue } from './value.js';
import { SETTING_WIDGET } from './widget.js';

const isEmpty = (value) => value === undefined || value === null || value === '';
const same = (one, other) => (isEmpty(one) && isEmpty(other)) || one === other;

export function registerSettings(CMS) {
  const React = globalThis.__SVELTIA_CMS_REACT__;
  const h = React.createElement;

  CMS.registerFieldType(SETTING_WIDGET, function KonziloSetting(props) {
    const { value, onChange, field } = props;
    const shown = field.get('field');
    const { widget, default: preset } = plain(shown);
    const control = CMS.getFieldType(widget)?.control;
    const held = plain(value);
    // What the field shows once it is changed here, as `{ value }`: a number or a text being
    // typed shows what is typed, also where the setting then holds no value, the default typed
    // again or the field emptied on the way to another value.
    const [chosen, setChosen] = React.useState(null);
    const written = React.useRef(held);
    // A value from elsewhere, Sveltia's menu of the field among them, shows as it is, with the
    // default where it is none.
    React.useEffect(() => {
      if (!same(held, written.current)) {
        written.current = held;
        setChosen(null);
      }
    }, [held]);
    if (!control) return null;
    return h(control, {
      ...props,
      field: shown,
      value: chosen ? chosen.value : shownValue(held, preset),
      onChange: (next) => {
        const given = plain(next);
        setChosen({ value: given });
        written.current = keptValue(given, preset);
        onChange(written.current);
      },
    });
  });
}
