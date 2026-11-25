// The post types an Admin may choose for an incoming feed (ADR 0079): those whose posts can be
// published from what a feed gives, a title, a text of paragraphs, a date and the address of the
// original. An article's main headline, which it requires, is its title. A type that requires any
// other field, such as a featured image or a term, or that takes no paragraph, cannot be chosen,
// since its posts would all be refused.

// The fields a feed's post holds of what the feed gives, beside its title and its date.
const GIVEN = new Set(['headline']);

// Each type of the site, as the site description reads it, by its name and label, in the order
// declared, with whether it can be chosen.
export const feedTypes = (site) => Object.values(site.types).map((type) => ({
  name: type.name,
  label: type.label,
  choosable: type.elements.includes('paragraph') && type.fields.every((field) => !field.required || GIVEN.has(field.kind)),
}));
