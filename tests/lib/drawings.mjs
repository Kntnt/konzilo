// SVG images the converter suite and the acceptance suite draw themselves
//: a drawing as a drawing program saves it, and the same drawing
// holding each construct the site refuses, so that no test holds a real
// file. Each is a Buffer of the file's bytes.

import { gzipSync } from 'node:zlib';

// The drawing's quarters, as sRGB colours: the quarters of the photos in
// photos.mjs, so that a raster made of it is read as they are.
export const DRAWN_QUARTERS = {
  topLeft: [255, 0, 0],
  topRight: [0, 255, 0],
  bottomLeft: [0, 0, 255],
  bottomRight: [255, 255, 255],
};

// A PNG of one red pixel, as a drawing program embeds a picture.
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

// The drawing's text: four quarters in the colours above, drawn four ways (a
// rectangle, an element used again by its #id, a gradient named by url(#id)
// and a path), on a canvas of `width` × `height` user units, its viewBox.
// As a drawing program saves it: an XML declaration, a comment, metadata,
// the program's namespaces and its data, a title, indentation, and a
// one-pixel picture as a data: image in a corner. `size` gives the root a
// width and a height of its own; `root` adds attributes to it; `inside`
// adds markup after the quarters; `before` goes before the root element.
export function drawingText({ width = 120, height = 80, size, root = '', inside = '', before = '', viewBox = true } = {}) {
  const [w, h] = [width / 2, height / 2];
  const sized = size ? ` width="${size[0]}" height="${size[1]}"` : '';
  const box = viewBox ? ` viewBox="0 0 ${width} ${height}"` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Drawn for Konzilo's tests -->
${before}<svg
   xmlns="http://www.w3.org/2000/svg"
   xmlns:xlink="http://www.w3.org/1999/xlink"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:dc="http://purl.org/dc/elements/1.1/"${sized}${box}
   sodipodi:docname="quarters.svg"
   inkscape:version="1.4 (e7c3feb1, 2024-10-09)"${root}>
  <sodipodi:namedview id="namedview1" pagecolor="#ffffff" inkscape:zoom="2.5" inkscape:cx="60" />
  <metadata id="metadata1">
    <rdf:RDF>
      <rdf:Description>
        <dc:title>Four quarters</dc:title>
      </rdf:Description>
    </rdf:RDF>
  </metadata>
  <title>Four quarters</title>
  <defs id="defs1">
    <linearGradient id="blue">
      <stop offset="0" stop-color="#0000ff" />
      <stop offset="1" stop-color="#0000ff" />
    </linearGradient>
    <rect id="green" width="${w}" height="${h}" fill="#00ff00" />
  </defs>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">
    <!-- the quarters -->
    <rect x="0" y="0" width="${w}" height="${h}" fill="#ff0000" />
    <use href="#green" x="${w}" y="0" />
    <rect x="0" y="${h}" width="${w}" height="${h}" style="fill: url(#blue)" />
    <path d="M ${w} ${h} H ${width} V ${height} H ${w} Z" fill="#ffffff" />
    <image xlink:href="data:image/png;base64,${PIXEL}" x="0" y="0" width="1" height="1" />
  </g>${inside}
</svg>
`;
}

export function drawing(options) {
  return Buffer.from(drawingText(options));
}

// The drawing holding one construct the site refuses, by its name, with the
// words the exporter refuses it in (node/src/exporter/masters.js, REASONS).
export const REFUSED_DRAWINGS = {
  'a script': {
    reason: 'script',
    svg: () => drawing({ inside: '\n  <script>alert(1)</script>' }),
  },
  'a javascript: address': {
    reason: 'javascript',
    svg: () => drawing({ inside: '\n  <a href="javascript:alert(1)"><rect width="10" height="10" /></a>' }),
  },
  'an onload': {
    reason: 'handler',
    svg: () => drawing({ root: ' onload="alert(1)"' }),
  },
  'a foreignObject': {
    reason: 'foreign',
    svg: () => drawing({ inside: '\n  <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">Hi</div></foreignObject>' }),
  },
  'an outside href': {
    reason: 'outside',
    svg: () => drawing({ inside: '\n  <image href="https://example.com/picture.png" width="10" height="10" />' }),
  },
  'an outside CSS url()': {
    reason: 'outside',
    svg: () => drawing({ inside: '\n  <rect width="10" height="10" style="fill: url(https://example.com/paint.svg#p)" />' }),
  },
  'an @import': {
    reason: 'outside',
    svg: () => drawing({ inside: '\n  <style>@import "https://example.com/style.css";</style>' }),
  },
  'a data: SVG': {
    reason: 'embedded',
    svg: () => drawing({ inside: `\n  <image href="data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}" width="10" height="10" />` }),
  },
  'an entity declaration': {
    reason: 'entities',
    svg: () => drawing({ before: '<!DOCTYPE svg [\n  <!ENTITY name "Konzilo">\n]>\n', inside: '\n  <text x="0" y="10">&name;</text>' }),
  },
  'a set that sets an href': {
    reason: 'animation',
    svg: () => drawing({ inside: '\n  <a href="#layer1"><set attributeName="href" to="https://example.com/" begin="0s" /><rect width="10" height="10" /></a>' }),
  },
  'no proportions': {
    reason: 'proportions',
    svg: () => drawing({ viewBox: false, size: ['100%', '100%'] }),
  },
  'XML that is not well-formed': {
    reason: 'malformed',
    svg: () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"></svg>\n'),
  },
  'an SVGZ': {
    reason: 'compressed',
    svg: () => gzipSync(drawing()),
  },
};
