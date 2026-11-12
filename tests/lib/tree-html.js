// A component's body as a tree (ADR 0068) drawn as HTML again, each element with its
// properties as attributes, for a test's own component that draws its body from the tree, as a
// design would: `className` as `class`, and any other property in camelCase in kebab case, so
// that `dataKonziloBlock` is `data-konzilo-block`. Only what the tests' bodies hold: elements,
// text and a root.

const VOID = new Set(['br', 'hr', 'img', 'input', 'source', 'wbr']);

const escaped = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const attributeOf = (property) => (property === 'className' ? 'class' : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
const attributes = (properties) => Object.entries(properties)
  .filter(([, value]) => value !== false && value !== null && value !== undefined)
  .map(([property, value]) => (value === true ? ` ${attributeOf(property)}` : ` ${attributeOf(property)}="${escaped(Array.isArray(value) ? value.join(' ') : value)}"`))
  .join('');

export function treeHtml(node) {
  if (node.type === 'text') return escaped(node.value);
  if (node.type === 'root') return node.children.map(treeHtml).join('');
  if (node.type !== 'element') return '';
  const open = `<${node.tagName}${attributes(node.properties ?? {})}>`;
  return VOID.has(node.tagName) ? open : `${open}${node.children.map(treeHtml).join('')}</${node.tagName}>`;
}
