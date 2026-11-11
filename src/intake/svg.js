// The strict check of an SVG original, which refuses rather than cleans: an SVG can
// carry script, and a browser runs it when the file is opened by its address. It reads
// the file strictly as XML, and gives the reason in plain words, or null.

import sax from 'sax';
import { say } from './words.js';

const XHTML = 'http://www.w3.org/1999/xhtml';
const REFERENCES = new Set(['href', 'src']);
const ANIMATIONS = new Set(['animate', 'animatemotion', 'animatetransform', 'animatecolor', 'set']);

const still = (mime, base64) => {
  const bytes = Buffer.from(base64.slice(0, 64), 'base64');
  const riff = bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP';
  if (mime === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mime === 'png') return bytes.subarray(1, 4).toString('latin1') === 'PNG';
  // A moving WebP names ANIM among its first chunks.
  return riff && !Buffer.from(base64.slice(0, 256), 'base64').includes('ANIM');
};

// Whether a reference stays in the file: to a `#id`, or a still image in a `data:`.
function isInside(value) {
  const reference = value.trim();
  if (reference.startsWith('#')) return true;
  const data = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]*)$/i.exec(reference);
  return data !== null && still(data[1].toLowerCase(), data[2].replace(/\s/g, ''));
}

// A reference outside the file in a piece of CSS, or null.
function cssReference(css) {
  if (/@import/i.test(css)) return '@import';
  if (/image-set\s*\(/i.test(css)) return 'image-set()';
  for (const [, quoted, plain] of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi).map((match) => [match[0], match[1] ?? match[2], match[3]])) {
    if (!isInside(quoted ?? plain ?? '')) return `url(${(quoted ?? plain ?? '').trim()})`;
  }
  return null;
}

const proportioned = ({ width, height, viewBox }) => {
  if (viewBox && /^\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+[\d.]*[1-9][\d.]*[\s,]+[\d.]*[1-9][\d.]*\s*$/.test(viewBox)) return true;
  const number = /^\s*[\d.]*[1-9][\d.]*(?:px)?\s*$/;
  return number.test(width ?? '') && number.test(height ?? '');
};

// The drawing's size, from its viewBox, else its width and height: { width, height }.
export function svgSize(text) {
  const open = /<svg\b[^>]*>/i.exec(text)?.[0] ?? '';
  const attribute = (name) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(open)?.[1];
  const box = attribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (box?.length === 4) return { width: box[2], height: box[3] };
  return { width: Number.parseFloat(attribute('width')), height: Number.parseFloat(attribute('height')) };
}

// What an SVG holds that the site cannot show, by its name in the catalogues.
const part = (name, values = {}) => ({ name: `about.svg-${name}`, values });

// Why the site cannot show this SVG, or null. `bytes` are the original's.
export function svgProblem(bytes) {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return say('refusal.svg', { what: part('compression') });
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return say('refusal.svg', { what: part('not-utf8') });
  const declared = /^﻿?<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(text)?.[1];
  if (declared && declared.toLowerCase() !== 'utf-8') return say('refusal.svg', { what: part('encoding', { encoding: declared }) });
  let problem = null;
  let root = null;
  const stack = [];
  const refuse = (what) => {
    problem ??= say('refusal.svg', { what });
  };
  const parser = sax.parser(true, { xmlns: true, position: false });
  parser.onerror = (error) => {
    refuse(part('malformed', { detail: error.message.split('\n')[0] }));
    parser.error = null;
  };
  parser.ondoctype = (doctype) => {
    if (/\[|<!ENTITY/i.test(doctype)) refuse(part('doctype'));
  };
  parser.onprocessinginstruction = ({ name }) => {
    if (name.toLowerCase() === 'xml-stylesheet') refuse(part('stylesheet'));
  };
  parser.onopentag = (node) => {
    const local = node.local.toLowerCase();
    root ??= node;
    stack.push(local);
    if (local === 'script') refuse(part('script'));
    if (local === 'foreignobject') refuse(part('foreign-object'));
    if (node.uri === XHTML) refuse(part('xhtml'));
    for (const attribute of Object.values(node.attributes)) {
      const name = attribute.local.toLowerCase();
      const { value } = attribute;
      if (name.startsWith('on')) refuse(part('handler', { handler: attribute.name }));
      if (/^\s*javascript:/i.test(value)) refuse(part('javascript'));
      if (REFERENCES.has(name) && !isInside(value)) refuse(part('reference', { reference: value.trim().slice(0, 60) }));
      const reference = cssReference(value);
      if (reference) refuse(part('reference', { reference }));
      if (ANIMATIONS.has(local) && name === 'attributename' && (REFERENCES.has(value.toLowerCase().replace(/^xlink:/, '')) || value.toLowerCase().startsWith('on'))) {
        refuse(part('animation'));
      }
    }
  };
  parser.onclosetag = () => stack.pop();
  const css = (inner) => {
    if (stack.at(-1) !== 'style') return;
    const reference = cssReference(inner);
    if (reference) refuse(part('reference', { reference }));
  };
  parser.ontext = css;
  parser.oncdata = css;
  parser.write(text.replace(/^﻿/, '')).close();
  if (problem) return problem;
  if (!root || root.local !== 'svg') return say('refusal.svg', { what: part('root') });
  const given = Object.fromEntries(Object.values(root.attributes).map((attribute) => [attribute.local, attribute.value]));
  if (!proportioned(given)) return say('refusal.svg', { what: part('proportions') });
  return null;
}
