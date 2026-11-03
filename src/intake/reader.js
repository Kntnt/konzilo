// The reader handed to the body check: Sätteri, with the options the integration owns.

import { markdownToMdast } from 'satteri';
import { markdownFeatures } from '../astro/reader-features.js';

export const reader = Object.freeze({
  tree: (markdown) => markdownToMdast(markdown, { features: markdownFeatures, position: true }),
});
