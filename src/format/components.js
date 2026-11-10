// A site's own components: the directives its site description declares under
// `components`, beside the core's own, the post list and the form. Each is read
// against the shape the rule data gives a directive, and the rule data with them
// added is what a site's bodies are read against, by the intake, the site's reader
// and the editor alike. It imports nothing, so that the editor runs it in the browser.
//
// A component as declared:
//
//   { label, form, body, attributes: { <attribute>: { type, label, values, default,
//     pattern, refusal, required } } }
//
// `form` is `leaf`, a directive on a line of its own, or `container`, around blocks;
// `body` is a leaf's `none` or `text`, its label, or a container's `blocks`.

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ATTRIBUTE = /^[a-z][a-zA-Z0-9]*$/;
// What an attribute may not be called: the names the reader gives `#x` and `.x`, and the
// setting that holds a text body.
const RESERVED = new Set(['id', 'class', 'content']);
const BODIES = Object.freeze({ leaf: Object.freeze(['none', 'text']), container: Object.freeze(['blocks']) });
const TYPES = Object.freeze(['string', 'integer', 'boolean']);
const COMPONENT_KEYS = Object.freeze(['label', 'form', 'body', 'attributes']);
const ATTRIBUTE_KEYS = Object.freeze(['type', 'label', 'values', 'default', 'pattern', 'refusal', 'required']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The element a component is in the rule data: its own name, or `<name>-directive`
// where the core has an element of that name that is no directive, as Markdown's list
// is `list`. The directive keeps the component's name.
export function componentElement(name, rules) {
  const core = rules.elements[name];
  return core && !core.directive ? `${name}-directive` : name;
}

const fitsType = (type, value) => (type === 'string' ? typeof value === 'string' : type === 'integer' ? Number.isInteger(value) : typeof value === 'boolean');

function readAttribute(name, setting, path, problems, readLabel) {
  if (!ATTRIBUTE.test(name) || RESERVED.has(name)) problems.push(`${path}: an attribute's name is in camelCase, and not id, class or content`);
  if (!isObject(setting)) {
    problems.push(`${path}: must be an object`);
    return null;
  }
  for (const key of Object.keys(setting)) if (!ATTRIBUTE_KEYS.includes(key)) problems.push(`${path}.${key}: is no key of an attribute; it takes ${ATTRIBUTE_KEYS.join(', ')}`);
  const read = {};
  if (!TYPES.includes(setting.type)) problems.push(`${path}.type: must be ${TYPES.join(', ')}`);
  else read.type = setting.type;
  if (setting.label !== undefined) {
    const before = problems.length;
    const label = readLabel(setting.label, `${path}.label`, problems);
    if (problems.length === before) read.label = label;
  }
  if (setting.values !== undefined) {
    if (!Array.isArray(setting.values) || setting.values.length === 0 || !setting.values.every((value) => fitsType(setting.type, value))) problems.push(`${path}.values: must list the values of its type`);
    else if (new Set(setting.values).size !== setting.values.length) problems.push(`${path}.values: names a value twice`);
    else read.values = [...setting.values];
  }
  if (setting.pattern !== undefined) {
    let valid = typeof setting.pattern === 'string';
    if (valid) {
      try {
        new RegExp(setting.pattern, 'u');
      } catch {
        valid = false;
      }
    }
    if (!valid) problems.push(`${path}.pattern: must be a regular expression`);
    else read.pattern = setting.pattern;
  }
  if (setting.refusal !== undefined) {
    if (typeof setting.refusal !== 'string' || setting.refusal.trim() === '') problems.push(`${path}.refusal: must be a text`);
    else read.refusal = setting.refusal;
  }
  if (setting.required !== undefined) {
    if (typeof setting.required !== 'boolean') problems.push(`${path}.required: must be true or false`);
    else if (setting.required) read.required = true;
  }
  if (Object.hasOwn(setting, 'default')) {
    if (read.required) problems.push(`${path}: is required, or has a default, not both`);
    else if (!fitsType(setting.type, setting.default)) problems.push(`${path}.default: must be of its type`);
    else if (read.values && !read.values.includes(setting.default)) problems.push(`${path}.default: must be one of its values`);
    else if (read.pattern && setting.default !== '' && !new RegExp(read.pattern, 'u').test(String(setting.default))) problems.push(`${path}.default: must match its pattern`);
    else read.default = setting.default;
  }
  return read;
}

// The components a site declares, as read: { <name>: { name, element, label, form, body,
// attributes } } in the order declared, each attribute as declared, its keys checked.
// `rules` is the core's rule data, whose directives no component may be named as.
// `readLabel` checks a label, a component's and an attribute's, as the site
// description's checker checks every label of the site's own (checks.js, label()):
// one text for every language, or one by interface language.
export function readComponents(declared, rules, path, problems, readLabel) {
  if (declared === undefined) return {};
  if (!isObject(declared)) {
    problems.push(`${path}: must be an object of the site's components, by name`);
    return {};
  }
  const read = {};
  for (const [name, component] of Object.entries(declared)) {
    const at = `${path}.${name}`;
    if (!NAME.test(name)) {
      problems.push(`${at}: a component's name is lowercase letters, digits and hyphens, starting with a letter`);
      continue;
    }
    if (Object.values(rules.elements).some((rule) => rule.directive?.name === name)) {
      problems.push(`${at}: ${name} is the core's own directive`);
      continue;
    }
    if (!isObject(component)) {
      problems.push(`${at}: must be an object`);
      continue;
    }
    for (const key of Object.keys(component)) if (!COMPONENT_KEYS.includes(key)) problems.push(`${at}.${key}: is no key of a component; it takes ${COMPONENT_KEYS.join(', ')}`);
    readLabel(component.label, `${at}.label`, problems);
    const form = Object.hasOwn(BODIES, component.form) ? component.form : null;
    if (form === null) problems.push(`${at}.form: must be leaf or container`);
    else if (!BODIES[form].includes(component.body)) problems.push(`${at}.body: a ${form}'s body is ${BODIES[form].join(' or ')}`);
    const attributes = {};
    if (component.attributes !== undefined && !isObject(component.attributes)) problems.push(`${at}.attributes: must be an object of attributes, by name`);
    else {
      for (const [attribute, setting] of Object.entries(component.attributes ?? {})) {
        const one = readAttribute(attribute, setting, `${at}.attributes.${attribute}`, problems, readLabel);
        if (one) attributes[attribute] = one;
      }
    }
    read[name] = { name, element: componentElement(name, rules), label: component.label, form, body: component.body, attributes };
  }
  return read;
}

// The rule data with a site's components added, each as an element whose rule has its
// directive: a container may hold any block a body may, the site's components among
// them, and a leaf's text takes what a heading's does. `components` as readComponents()
// gives them. The core's rule data is left as it is.
export function withComponents(rules, components) {
  const list = Object.values(components ?? {});
  if (list.length === 0) return rules;
  const blocks = [...new Set([
    ...Object.keys(rules.elements).filter((name) => !rules.elements[name].directive),
    ...Object.keys(rules.elements).filter((name) => rules.elements[name].directive),
    ...list.map((component) => component.element),
  ])];
  const elements = { ...rules.elements };
  for (const component of list) {
    const attributes = Object.fromEntries(Object.entries(component.attributes).map(([name, { label, ...setting }]) => [name, setting]));
    elements[component.element] = {
      // As a reason names it, in the language it is shown in (refusals.js).
      label: component.label,
      ...(component.form === 'container' ? { inner: blocks } : {}),
      ...(component.body === 'text' ? { inline: [...rules.elements.heading.inline] } : {}),
      directive: { name: component.name, form: component.form, body: component.body, attributes },
    };
  }
  return { ...rules, elements };
}
