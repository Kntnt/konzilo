// A value Sveltia hands the editor's code as plain data: an Immutable collection's own, as
// Sveltia keeps an entry's data and a field's settings, else the value as it is.
export const plain = (value) => (value?.toJS ? value.toJS() : value);
