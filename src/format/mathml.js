// A formula as the site shows it: its LaTeX as static MathML, made by Temml, with no script, no
// stylesheet and no font of its own, which every browser draws and a screen reader reads, the
// LaTeX kept in its annotation (ADR 0075). The intake, the site and the body field write and
// check a formula with this one Temml, so that it looks the same in the editor as on the site.

import temml from 'temml';

const OPTIONS = Object.freeze({ annotate: true, trust: false });

// A formula's MathML, `display` for a block formula. One Temml cannot read is shown as Temml
// shows an error, its LaTeX marked, which the intake never publishes.
export const mathML = (latex, display = false) => temml.renderToString(latex, { ...OPTIONS, displayMode: display, throwOnError: false });

// What Temml says it cannot read in a formula, without where: its own words, in English, which a
// refusal gives only beside what it could not read.
function problemOf(error) {
  if (error?.name !== 'ParseError') return { name: 'about.math-error', values: {} };
  return error.message.replace(/\s+at (?:position \d+|end of input)\b[\s\S]*$/, '').trim().replace(/\.$/, '');
}

// The LaTeX Temml could not read in a formula: what it underlines where it stopped; null where the
// formula ends before it is whole, with nothing to point at; and the whole formula where Temml
// stops at an error of its own.
function unreadIn(latex, error) {
  if (error?.name !== 'ParseError') return latex;
  if (error.position === latex.length) return null;
  return /(?:[^\u0332]\u0332)+/.exec(error.message)?.[0].replaceAll('\u0332', '').trim() || latex;
}

// Why the site cannot publish a formula, by its name in the core's catalogues and the values that
// fill it, or null for one Temml reads: the formula, `formula`, the LaTeX in it Temml could not
// read, `unread`, unless it ends before it is whole, and Temml's own words, `problem`.
export function formulaReason(latex, display = false) {
  try {
    temml.renderToString(latex, { ...OPTIONS, displayMode: display, throwOnError: true });
    return null;
  } catch (error) {
    const unread = unreadIn(latex, error);
    const problem = problemOf(error);
    return unread === null
      ? { name: 'refusal.math-unfinished', values: { formula: latex, problem } }
      : { name: 'refusal.math-unreadable', values: { formula: latex, unread, problem } };
  }
}
