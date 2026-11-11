// The metadata templates of the search and sharing settings: text with
// variables, `{{ post.title }}`. The variables are
// format/template-variables.json.
//
// A template's start page part knows the site's variables; a post type's
// part knows the posts' too, those of a field only when the type declares
// the field. Anything between `{{` and `}}` is a variable, and one the part
// does not know refuses the template. Astro renders each template into a
// page's head (astro/search-and-sharing.js) with renderTemplate().

import { labelIn, SOURCE_LANGUAGE } from './catalogues.js';
import table from './format/template-variables.json' with { type: 'json' };

// The variables a part of the templates knows, in the table's order, each
// { variable, label }: for the start page and the site (`type` null), the
// site's; for a post type, as siteDescription() checks it, also its posts',
// one for each field of the site's own and each taxonomy it declares, a label
// of the site's in British English, as the settings' help is.
export function variablesOf(type = null) {
  const variables = table.site.map(({ variable, label }) => ({ variable, label }));
  if (type === null) return variables;
  const fields = type.fields;
  for (const { variable, label, field } of table.post) {
    if (field === 'meta') {
      for (const own of fields.filter((found) => found.kind === 'meta')) {
        variables.push({ variable: variable.replace('{key}', own.name), label: label.replace('{label}', labelIn(own.label, SOURCE_LANGUAGE)) });
      }
    } else if (field === 'terms') {
      for (const terms of fields.filter((found) => found.kind === 'terms' && found.taxonomy)) {
        variables.push({ variable: variable.replace('{taxonomy}', terms.taxonomy.name), label: label.replace('{plural}', labelIn(terms.taxonomy.plural, SOURCE_LANGUAGE)) });
      }
    } else if (field === undefined || fields.some((found) => found.kind === field)) {
      variables.push({ variable, label: label.replace('{type}', labelIn(type.label, SOURCE_LANGUAGE)) });
    }
  }
  return variables;
}

// The variables a template names, each once, in the order it first names
// them: whatever stands between `{{` and `}}`, without the spaces at its ends.
export function variablesIn(template) {
  return [...new Set([...template.matchAll(/\{\{(.*?)\}\}/gs)].map(([, inner]) => inner.trim()))];
}

// A template rendered: each variable as its text in `values`, by the
// variable's name, one without a value as nothing. It tidies what
// it renders, spaces, line breaks included, collapse to one, and the
// `separator`, `{{ sep }}`'s text, goes where it stands at either end or
// right beside another, so that a part left empty leaves no separator.
export function renderTemplate(template, values, separator = '') {
  let text = template.replace(/\{\{(.*?)\}\}/gs, (_, inner) => values[inner.trim()] ?? '').replace(/\s+/g, ' ').trim();
  if (separator.trim() !== '') {
    const sep = separator.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text
      .replace(new RegExp(`${sep}(?:\\s*${sep})+`, 'g'), separator.trim())
      .replace(new RegExp(`^(?:${sep}\\s*)+|(?:\\s*${sep})+$`, 'g'), '')
      .trim();
  }
  return text;
}

// Why a template cannot be published with the variables a part knows, one
// reason for each variable it does not know, by its name in the core's
// catalogues (refusals.js).
export function templateProblems(template, variables) {
  const known = new Set(variables.map(({ variable }) => variable));
  return variablesIn(template)
    .filter((variable) => !known.has(variable))
    .map((variable) => ({ name: 'refusal.template-variable', values: { variable } }));
}
