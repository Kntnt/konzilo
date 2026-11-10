// The image field in Sveltia: an image from the image library, in place of Sveltia's own image
// field, which chooses among the files in Media. It loads when an entry opens.
//
// The field's settings in the configuration:
//   alt: false       the value is { src } with no alt text (the site icon)
//   text: true       the value is the address alone, as a text (the library's own file)
//   upload: true     the library's own entry: the field uploads the entry's file, and chooses none
//   fallback: true   the post's main image stands in, faded, while none is chosen
//   crop: [w, h]     the image is shown cropped to the size, with `safe: [w, h]` marked in the middle

import { signedInCredential } from '../credential.js';
import { imageLibrary } from '../body/library.js';

import { IMAGE_WIDGET } from './widget.js';

export { IMAGE_WIDGET };

const plainValue = (value) => (value?.toJS ? value.toJS() : value);

export function registerImageField(CMS, config) {
  const { api_root: api, repo: repository, branch = 'main' } = config.backend;
  const library = api ? imageLibrary({ api, repository, branch, credential: signedInCredential }) : null;

  // Whether the file is in the repository already: then the entry names it, and the same file
  // is not uploaded twice.
  const exists = async (path) => {
    const held = signedInCredential();
    if (!api || !held) return false;
    const address = `${api}/repos/${repository}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`;
    const answer = await fetch(address, { headers: { authorization: held } });
    return answer.ok;
  };

  CMS.registerFieldType(IMAGE_WIDGET, function KonziloImage(props) {
    const React = window.__SVELTIA_CMS_REACT__;
    const { value, onChange, addFile, field, forID, entry } = props;
    const standIn = plainValue(field.get('fallback')) === true ? plainValue(entry?.getIn?.(['data', 'image', 'src'])) ?? '' : '';
    const sized = (key) => { const pair = plainValue(field.get(key)); return Array.isArray(pair) ? { width: pair[0], height: pair[1] } : null; };
    const host = React.useRef(null);
    const live = React.useRef(null);
    const latest = React.useRef({ onChange, addFile, value, standIn });
    latest.current = { onChange, addFile, value, standIn };
    React.useEffect(() => {
      let gone = false;
      void import('./field.js').then(({ mountImageField }) => {
        if (gone) return;
        // The field takes a moment to load, and the value may have changed meanwhile.
        live.current = mountImageField(host.current, {
          value: plainValue(latest.current.value),
          changed: (next) => latest.current.onChange(next),
          addFile: (...given) => latest.current.addFile(...given),
          library,
          exists,
          alt: plainValue(field.get('alt')) !== false,
          text: plainValue(field.get('text')) === true,
          upload: plainValue(field.get('upload')) === true,
          smallestWidth: plainValue(field.get('smallestWidth')) ?? null,
          fallback: plainValue(field.get('fallback')) === true,
          crop: sized('crop'),
          safe: sized('safe'),
        });
        live.current.setStandIn(latest.current.standIn);
      });
      return () => {
        gone = true;
        live.current?.destroy();
      };
    }, []);
    React.useEffect(() => {
      live.current?.setValue(plainValue(value));
    }, [value]);
    React.useEffect(() => {
      live.current?.setStandIn(standIn);
    }, [standIn]);
    return React.createElement('div', { ref: host, id: forID, className: 'konzilo-pick-host' });
  });
}
