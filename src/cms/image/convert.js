// An image as the editor uploads it (ADR 0022): a JPEG, PNG or WebP turned upright, converted to
// sRGB by its own colour profile, scaled down so that its longest side is at most `longestSide`,
// never enlarged, and encoded by libwebp as a WebP at `quality`, or lossless, without any
// metadata, the place it was taken among it. An SVG is uploaded as it is (ADR 0023).
//
// The work is done in a worker of its own (convert-worker.js), which this module starts, and this
// module is imported when an upload starts, so that the editor loads none of it before.

import { kindOf } from '../../format/originals.js';

const HEAD = 4096;

// The file to upload in place of `file`, a WebP named as the file was but for its extension, and
// its size: { file, size: { width, height } }, or the SVG itself with no size.
export async function convertForUpload(file, { longestSide, quality, lossless = false }) {
  const kind = kindOf(new Uint8Array(await file.slice(0, HEAD).arrayBuffer()));
  if (kind === 'svg') return { file, size: null };
  const worker = new Worker(new URL('./convert-worker.js', import.meta.url), { type: 'module' });
  try {
    const answer = await new Promise((resolve, reject) => {
      worker.addEventListener('message', ({ data }) => resolve(data));
      worker.addEventListener('error', (event) => reject(new Error(event.message || 'the worker stopped')));
      worker.postMessage({ file, longestSide, quality, lossless });
    });
    if (answer.error) throw new Error(`the image could not be converted: ${answer.error}`);
    const name = `${file.name.replace(/\.[^.]*$/, '') || 'image'}.webp`;
    return { file: new File([answer.bytes], name, { type: 'image/webp' }), size: { width: answer.width, height: answer.height } };
  } finally {
    worker.terminate();
  }
}
