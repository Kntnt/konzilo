// The fixture design system's check of what its components hold: a series holds one list.

export function componentProblems(name, attributes, blocks) {
  if (name !== 'list') return [];
  return blocks.filter((block) => block.type === 'list').length === 1 ? [] : ['a series holds one list'];
}
