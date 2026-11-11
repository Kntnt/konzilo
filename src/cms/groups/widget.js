// The field group's type by name, which the generated configuration and the editor share, and
// how a group's name begins. No field of a site's own can begin so, since a field's name is
// letters, digits and underscores (site-description.js), so a group's name is never a field's.
export const GROUP_WIDGET = 'konzilo-group';
export const GROUP_PREFIX = 'group-';

// The formats a post's source file is read and written in, Sveltia's two names for YAML front
// matter (source.js): the built-in types' files in one, which holds a group of the site's own
// fields, and the files of a type of the site's own in the other, which holds none. Sveltia tells
// a format nothing of a file's collection, so a field is in the same group in every form of one
// format, and each kind of type reads its files alike.
export const BUILT_IN_FORMAT = 'yaml-frontmatter';
export const OWN_FORMAT = 'frontmatter';
