// The reader handed to the body check: Sätteri, with the options the integration owns, and
// formulas read by the rule (format/formula-reading.js).

import { markdownToMdast } from 'satteri';
import { markdownFeatures } from '../astro/reader-features.js';
import { formulaReader } from '../format/formula-reading.js';

export const reader = formulaReader(markdownToMdast, markdownFeatures);
