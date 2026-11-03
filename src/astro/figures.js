// Images in body text: a paragraph that holds nothing but an
// image, `![alt](address)`, shows it as a figure, and a caption after a hard
// line break, on the paragraph's next line, as the figure's caption.
//
// Galleries: a paragraph that holds two or more such images, one
// after the other, each on a line of its own after a soft line break, shows
// them as a gallery, a figure of their figures; a last line after a soft line
// break that is no image is the gallery's own caption.
//
// Astro's own plugin, which runs after the site's, makes each image's
// responsive versions from the master at the address, so each figure keeps
// the <img> the reader made of the Markdown image.
//
// A gallery carries Konzilo's own class, and nothing else here carries one.

const element = (tagName, children, properties = {}) => ({ type: 'element', tagName, properties, children });
const isTag = (node, tagName) => node?.type === 'element' && node.tagName === tagName;

// A paragraph's lines, each as { after, nodes }: `after` is the line break
// before it, `hard` (a <br>) or `soft` (a newline in the text), null for the
// first line. The renderer writes a newline after a <br>, which starts the
// next line's text and is no line break of its own.
function linesOf(paragraph) {
  const lines = [{ after: null, nodes: [] }];
  let afterBreak = false;
  for (const node of paragraph.children) {
    if (isTag(node, 'br')) {
      lines.push({ after: 'hard', nodes: [] });
      afterBreak = true;
      continue;
    }
    if (node.type === 'text') {
      const value = afterBreak ? node.value.replace(/^\n/, '') : node.value;
      value.split('\n').forEach((part, i) => {
        if (i > 0) lines.push({ after: 'soft', nodes: [] });
        if (part !== '') lines.at(-1).nodes.push({ ...node, value: part });
      });
    } else lines.at(-1).nodes.push(node);
    afterBreak = false;
  }
  return lines;
}

// The figure a paragraph shows, as a hast element: an image's, a gallery's,
// or null when the paragraph is neither an image alone, with its caption, nor
// a gallery.
export function figureOf(paragraph) {
  const items = [];
  let caption = null;
  for (const { after, nodes } of linesOf(paragraph)) {
    const [picture, ...rest] = nodes;
    const image = rest.length === 0 && isTag(picture, 'img') ? picture : null;
    // The gallery's caption is the last line, and a caption holds no image.
    if (nodes.length === 0 || caption !== null || (!image && nodes.some((node) => isTag(node, 'img')))) return null;
    if (after === 'hard') {
      // An image's caption is the line right after the image's own.
      const last = items.at(-1);
      if (!last || last.caption || image) return null;
      last.caption = nodes;
    } else if (image) items.push({ picture: image, caption: null });
    else if (items.length > 1) caption = nodes;
    else return null;
  }
  const figures = items.map((item) => element('figure', [
    item.picture,
    ...(item.caption ? [element('figcaption', item.caption)] : []),
  ]));
  if (figures.length === 1) return figures[0];
  if (figures.length === 0) return null;
  return element('figure', [
    ...figures,
    ...(caption ? [element('figcaption', caption)] : []),
  ], { className: ['konzilo-gallery'] });
}

// Sätteri's HTML tree plugin that turns such a paragraph into its figure.
export const figures = {
  name: 'konzilo-figures',
  element: {
    filter: ['p'],
    visit(node, ctx) {
      const figure = figureOf(node);
      if (figure) ctx.replaceNode(node, figure);
    },
  },
};
