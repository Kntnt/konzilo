// The image field in Sveltia: an image from the image library, in place of Sveltia's own image
// field, which chooses among the files in Media. It loads when an entry opens.
//
// The field's settings in the configuration:
//   alt: false       the value is { src } with no alt text (the site icon)
//   text: true       the value is the address alone, as a text (the library's own file)
//   upload: true     the library's own entry: the field uploads the entry's file, and chooses none
//   fallback: true   the post's main image stands in, faded, while none is chosen
//   crop: [w, h]     the image is shown cropped to the size, with `safe: [w, h]` marked in the middle
//   frames: [...]    a post's image: its value holds its focal point too, `focalPoint`, which the
//                    field moves by these frames (frames.js), and which choosing copies

import { signedInCredential } from '../credential.js';
import { imageLibrary } from '../body/library.js';

import { DISPLAY_WIDTH_WIDGET, FOCAL_POINT_WIDGET, IMAGE_WIDGET, LOSSLESS_WIDGET } from './widget.js';
import { displayWidthChoice, losslessChoice } from './entry-choices.js';
import { DISPLAY_WIDTH_MOST } from '../../format/body.js';
import { say } from '../interface-language.js';
import { plain } from '../plain.js';
import { refuseAtSave } from '../refusals.js';
import { sourceOf, sourceReader } from '../source.js';

export { DISPLAY_WIDTH_WIDGET, FOCAL_POINT_WIDGET, IMAGE_WIDGET, LOSSLESS_WIDGET };

export function registerImageField(CMS, config) {
  const { api, repository, branch } = sourceOf(config);
  const library = api ? imageLibrary({ api, repository, branch, credential: signedInCredential }) : null;
  const source = sourceReader({ api, repository, branch, credential: signedInCredential });

  // Whether the file is in the repository already: then the entry names it, and the same file
  // is not uploaded twice. Where that cannot be asked, it is uploaded.
  const exists = (path) => (api ? source.exists(path).catch(() => false) : Promise.resolve(false));

  CMS.registerFieldType(IMAGE_WIDGET, function KonziloImage(props) {
    const React = window.__SVELTIA_CMS_REACT__;
    const { value, onChange, addFile, field, forID, entry } = props;
    const falls = plain(field.get('fallback')) === true;
    const standIn = falls ? plain(entry?.getIn?.(['data', 'image', 'src'])) ?? '' : '';
    const standInPoint = falls ? plain(entry?.getIn?.(['data', 'image', 'focalPoint'])) ?? null : null;
    // How a library entry's saved file was uploaded, which its own field writes (entry-choices.js).
    const lossless = plain(field.get('upload')) === true && plain(entry?.getIn?.(['data', 'lossless'])) === true;
    const sized = (key) => { const pair = plain(field.get(key)); return Array.isArray(pair) ? { width: pair[0], height: pair[1] } : null; };
    const host = React.useRef(null);
    const live = React.useRef(null);
    const latest = React.useRef({ onChange, addFile, value, standIn, standInPoint, lossless });
    latest.current = { onChange, addFile, value, standIn, standInPoint, lossless };
    React.useEffect(() => {
      let gone = false;
      void import('./field.js').then(({ mountImageField }) => {
        if (gone) return;
        // The field takes a moment to load, and the value may have changed meanwhile.
        live.current = mountImageField(host.current, {
          value: plain(latest.current.value),
          changed: (next) => latest.current.onChange(next),
          addFile: (...given) => latest.current.addFile(...given),
          library,
          exists,
          alt: plain(field.get('alt')) !== false,
          text: plain(field.get('text')) === true,
          upload: plain(field.get('upload')) === true,
          smallestWidth: plain(field.get('smallestWidth')) ?? null,
          fallback: plain(field.get('fallback')) === true,
          crop: sized('crop'),
          safe: sized('safe'),
          frames: plain(field.get('frames')) ?? null,
          lossless: latest.current.lossless,
          chosenLossless: (chosen) => losslessChoice.tell(chosen),
          chosenDisplayWidth: (width) => displayWidthChoice.tell(width),
        });
        live.current.setStandIn(latest.current.standIn, latest.current.standInPoint);
      });
      return () => {
        gone = true;
        live.current?.destroy();
      };
    }, []);
    React.useEffect(() => {
      live.current?.setValue(plain(value));
    }, [value]);
    React.useEffect(() => {
      live.current?.setStandIn(standIn, standInPoint);
    }, [standIn, standInPoint?.x, standInPoint?.y]);
    React.useEffect(() => {
      live.current?.setLossless(lossless);
    }, [lossless]);
    return React.createElement('div', { ref: host, id: forID, className: 'konzilo-pick-host' });
  });

  // A library entry's *Lossless compression*, as the file field chose it: `true`, or nothing, which
  // leaves it out of the file. It draws nothing, and its section is hidden (form.css).
  CMS.registerFieldType(LOSSLESS_WIDGET, function KonziloLossless({ onChange }) {
    const React = window.__SVELTIA_CMS_REACT__;
    const latest = React.useRef(onChange);
    latest.current = onChange;
    React.useEffect(() => losslessChoice.watch((chosen) => latest.current(chosen ? true : '')), []);
    return null;
  });

  // A library entry's *Display width*: *Fill the column*, which leaves it out of the file, or *At
  // most* a number of pixels. The file field fills it in for a file named `@2x` or `@3x`, and the
  // editor may change it at any time. Sveltia's label names it, and the choice's own name is there
  // for a screen reader alone.
  // The display widths drawn in an entry's form, one while it is open. Where *At most* is chosen
  // without a width it can take, the Save is refused and the choice says why, with the focus in its
  // pixels, as the chooser's upload is, rather than the entry saved to fill the column.
  const choosing = new Set();
  CMS.registerEventListener({
    name: 'preSave',
    handler: () => {
      for (const box of choosing) if (!box.check()) refuseAtSave(say('body.displayWidthRefused', { most: DISPLAY_WIDTH_MOST }));
    },
  });

  // A library entry's *Focal point*: the entry's file, as its own field holds it, with the point
  // and the frames of the site's aspect ratios on it (focal-point.js), which writes { x, y }, or
  // nothing, which leaves it out of the file. A file chosen and not yet saved shows as it was
  // chosen; a saved one as the service's small picture of it.
  CMS.registerFieldType(FOCAL_POINT_WIDGET, function KonziloFocalPoint({ value, onChange, field, entry, forID }) {
    const React = window.__SVELTIA_CMS_REACT__;
    const src = plain(entry?.getIn?.(['data', 'src'])) ?? '';
    const host = React.useRef(null);
    const live = React.useRef(null);
    const latest = React.useRef({ onChange, value, src });
    latest.current = { onChange, value, src };
    const shown = (address) => {
      if (!address) return Promise.resolve(null);
      return address.startsWith('blob:') ? Promise.resolve(address) : library?.picture(address) ?? Promise.resolve(null);
    };
    React.useEffect(() => {
      let gone = false;
      void import('./focal-point.js').then(({ focalPointPicker }) => {
        if (gone) return;
        live.current = focalPointPicker(host.current, {
          focus: plain(latest.current.value),
          frames: plain(field.get('frames')) ?? [],
          changed: (point) => latest.current.onChange(point ?? ''),
        });
        live.current.root.querySelector('[role="slider"]').id = forID;
        void shown(latest.current.src).then((address) => live.current?.setAddress(address));
      });
      return () => {
        gone = true;
        live.current?.destroy();
      };
    }, []);
    React.useEffect(() => {
      let current = true;
      void shown(src).then((address) => {
        if (current) live.current?.setAddress(address);
      });
      return () => {
        current = false;
      };
    }, [src]);
    // A value from outside, as a saved entry's, unless it is the point as it stands.
    React.useEffect(() => {
      const picker = live.current;
      const given = plain(value);
      const now = picker?.read() ?? null;
      if (picker && !(now?.x === given?.x && now?.y === given?.y)) picker.set(given);
    }, [value]);
    return React.createElement('div', { ref: host, className: 'konzilo-pick-host konzilo-focal-host' });
  });

  CMS.registerFieldType(DISPLAY_WIDTH_WIDGET, function KonziloDisplayWidth({ value, onChange, forID }) {
    const React = window.__SVELTIA_CMS_REACT__;
    const host = React.useRef(null);
    const live = React.useRef(null);
    const latest = React.useRef({ onChange, value });
    latest.current = { onChange, value };
    const written = (width) => latest.current.onChange(width ?? '');
    React.useEffect(() => {
      let gone = false;
      void import('./display-width.js').then(({ displayWidthBox }) => {
        if (gone) return;
        live.current = displayWidthBox(host.current, { label: false, className: 'konzilo-pick-check', changed: (read) => written(read?.width ?? null) });
        live.current.first.id = forID;
        live.current.set(plain(latest.current.value));
        choosing.add(live.current);
      });
      const stop = displayWidthChoice.watch((width) => {
        live.current?.set(width);
        written(width);
      });
      return () => {
        gone = true;
        stop();
        choosing.delete(live.current);
        live.current?.row.remove();
      };
    }, []);
    // A value from outside, as a saved entry's, unless it is what the choice says already, which it
    // is while *At most* waits for its pixels.
    React.useEffect(() => {
      const box = live.current;
      const given = plain(value);
      if (box && (box.read()?.width ?? null) !== (Number.isInteger(given) ? given : null)) box.set(given);
    }, [value]);
    return React.createElement('div', { ref: host, className: 'konzilo-pick-host konzilo-display-width-host' });
  });
}
