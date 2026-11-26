// A post's body as a tree, for a site's template (ADR 0068), reached as bodyTree() of
// `@kntnt/konzilo/astro`:
//
//   import { bodyTree } from '@kntnt/konzilo/astro';
//   const tree = await bodyTree(article);
//   const crossheads = tree.children.filter((node) => node.type === 'element' && node.tagName === 'h2');
//
// Given a post's entry, the tree is the one a component is given as `content`, of the whole body:
// a hast `root` read by Sätteri from the HTML Astro's render() gives the body, the HTML Body.astro
// is given and draws its components from, so each heading holds its ID, an image is as the page
// draws it but for the lightbox, a component and a post list stand as their plain rendering,
// holding their bodies, and in the live preview each block holds its mark as `dataKonziloBlock`.
// A component's `content` is the same tree as its part of this one.
//
// Given HTML, the tree is that HTML's, read as `content` is: a template's own component around
// `<Body>` reads what Body rendered, `await bodyTree(await Astro.slots.render('default'))`, with
// each component as the site's component drew it, a post list by its presentation, and in the live
// preview the marks of the page, a component's on its root.
//
// A new tree each time, which a template may change as it likes.

import { bodyTree as treeOf } from './directives.js';

// What `make()` gives, made when first asked and then kept, but made again at the next ask where
// making it failed, so that one failure, such as a dev server may meet, does not stay.
export function madeOnce(make) {
  let made = null;
  return () => {
    made ??= Promise.resolve().then(make).catch((error) => {
      made = null;
      throw error;
    });
    return made;
  };
}

// What renders an entry's Content to its HTML outside the page's own rendering, its images made,
// as a feed renders a body (routes/feed.js): Astro's container, made when a template first asks.
// Imported then, since the site's astro.config.mjs loads this file too, where Astro's own modules
// are not.
const container = madeOnce(async () => {
  const { experimental_AstroContainer: AstroContainer } = await import('astro/container');
  return AstroContainer.create();
});

export async function bodyTree(given) {
  if (typeof given === 'string') return treeOf(given);
  // Imported when asked, as the container is.
  const { render } = await import('astro:content');
  const { Content } = await render(given);
  return treeOf(await (await container()).renderToString(Content));
}
