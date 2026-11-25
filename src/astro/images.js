// The widths and sizes in which a site draws an image in each context (image-versions.js), for
// its templates, reached as `@kntnt/konzilo/astro/images`: the site's design's, through
// konzilo({ images }), or else the core's. Spread into Astro's <Image>, they make it serve the
// image in those widths, by `srcset` and `sizes`, each version no wider than its master, and its
// `src` the widest of them (image-service.js).
//
//   import { imageVersions } from '@kntnt/konzilo/astro/images';
//   <Image src={entry.data.image.src} alt={entry.data.image.alt} {...imageVersions('card')} />
//
// The contexts are `body`, `gallery`, `lightbox`, `hero` and `card`.

import contexts from 'virtual:konzilo/images';

// The widths and sizes of a `context`, as { widths, sizes }.
export function imageVersions(context) {
  if (!Object.hasOwn(contexts, context)) throw new Error(`imageVersions() takes a context the core knows: ${Object.keys(contexts).join(', ')}, not ${context}`);
  const { widths, sizes } = contexts[context];
  return { widths: [...widths], sizes };
}
