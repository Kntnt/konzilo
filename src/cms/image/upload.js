// What both ways an editor uploads an image do with the file chosen (ADR 0022, ADR 0063): the
// chooser's upload, from a body or an image field, and the image library entry's own form. The
// file is converted in the browser before anything is sent, as the site's settings stand at that
// moment, and *Lossless compression*, ticked for a PNG unless the editor says otherwise, decides
// how. What the site would refuse of the result is said in the intake's words.

import { uploadProblem } from '../body/chooser-check.js';
import { made } from '../body/dialog.js';
import { say } from '../interface-language.js';
import { kindOf } from '../../format/originals.js';
import { uploadSettingsOf } from './upload-settings.js';

const HEAD = 4096;

// What a file is by its first bytes, as originals.js names it.
export const kindOfFile = async (file) => kindOf(new Uint8Array(await file.slice(0, HEAD).arrayBuffer()));

// Whether a file of this kind is converted at all, and then whether lossless by default: a PNG is
// most often a drawing, a diagram or a screenshot, whose every pixel counts.
export const isConverted = (kind) => ['jpeg', 'png', 'webp'].includes(kind);
export const losslessByDefault = (kind) => kind === 'png';

let boxes = 0;

// The checkbox *Lossless compression*, with what it does under it, which a screen reader reads
// with it: { row, input }.
export function losslessBox(parent, className = 'konzilo-dialog-check') {
  const row = made('div', className, parent);
  const label = made('label', '', row);
  const input = made('input', '', label);
  input.type = 'checkbox';
  made('span', '', label).textContent = say('body.lossless');
  const hint = made('p', 'konzilo-dialog-hint', row);
  hint.id = `konzilo-lossless-hint-${(boxes += 1)}`;
  hint.textContent = say('body.losslessHint');
  input.setAttribute('aria-describedby', hint.id);
  return { row, input };
}

// The file to upload in place of `file`, or why the site would not take it: { file } or
// { problem }. `library` reads the settings, or is null where there is none to read them from.
// An error of the conversion itself says so by `converting`, since the editor is told otherwise
// of it than of settings that could not be read.
export async function preparedUpload(file, { library, lossless, smallestWidth = null }) {
  const settings = library ? await library.uploadSettings() : uploadSettingsOf({});
  let converted;
  try {
    const { convertForUpload } = await import('./convert.js');
    converted = await convertForUpload(file, { ...settings, lossless });
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { converting: true });
  }
  const problem = await uploadProblem(converted.file, { smallestWidth }, async () => converted.size);
  return problem === null ? { file: converted.file } : { problem };
}
