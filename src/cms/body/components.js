// The site's own components, as the editor's configuration gives them (config.js): the
// directives a body may hold beside the core's elements, which the field's reading and
// its early check take as the intake does. Set once, as the editor starts, before any
// field opens; this module holds no rule data, so that it loads with the first paint.

let declared = {};

export function useComponents(components) {
  declared = components ?? {};
}

export const siteComponents = () => declared;
