// The frames an editor places an image's focal point by (focal-point.js): one for each aspect ratio
// an image is cropped to, the design's for the contexts it names one for (konzilo({ images }),
// ADR 0022), and the sharing image's, each with the contexts that crop to it, in the order the
// contexts first name it. Each is { ratio, text, contexts }, `ratio` its width over its height and
// `text` as the design writes it, `16:9`.

import { SHARING_SIZE } from '../../format/article-parts.js';
import { ratioOf } from '../../format/focal-point.js';

// The sharing image's frame, 1200 × 630, which is 1.91:1 as Open Graph names it.
export const sharingFrame = () => ({ ratio: SHARING_SIZE.width / SHARING_SIZE.height, text: '1.91:1', contexts: ['sharing'] });

// The frames of the ratios a site's design names, `ratios` { <context>: '16:9' }, one for each
// ratio, as written, with each context that names it, and last the sharing image's, which a ratio
// the design writes as it does, 1.91:1, shares; what is no ratio is left out.
export function framesOf(ratios = {}) {
  const frames = [];
  const add = (text, value, context) => {
    const same = frames.find((frame) => frame.text === text);
    if (same) same.contexts.push(context);
    else frames.push({ ratio: value, text, contexts: [context] });
  };
  for (const [context, given] of Object.entries(ratios ?? {})) {
    const read = ratioOf(given);
    if (read !== null) add(read.text, read.value, context);
  }
  const sharing = sharingFrame();
  add(sharing.text, sharing.ratio, sharing.contexts[0]);
  return frames;
}
