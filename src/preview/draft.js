// A draft as a live preview's intake reads it: the form's values, as Sveltia holds them,
// made into the source file a save would write. The editor sends values and not a file,
// since it has no YAML writer of its own to reach for, and the service must check what it
// is given in any case.

import { stringify } from 'yaml';

const empty = (value) => value === null || value === undefined || value === ''
  || (Array.isArray(value) && value.length === 0)
  || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

// A form holds an empty string or an empty object for what a save leaves out.
function withoutEmpty(value) {
  if (Array.isArray(value)) return value.map(withoutEmpty).filter((one) => !empty(one));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, one]) => [key, withoutEmpty(one)]).filter(([, one]) => !empty(one)));
}

// The source file of a draft, from its fields, the body among them.
export function draftFile(fields) {
  const { body = '', ...rest } = withoutEmpty(fields);
  const head = Object.keys(rest).length === 0 ? '' : stringify(rest);
  return `---\n${head}---\n\n${body}${body === '' ? '' : '\n'}`;
}

const NAME = /^[A-Za-z0-9_-]+$/;

// Why a path is no post's source file on this site, or null: only a post with a page of
// its own has a preview, in its collection's folder, in its language's on a site in several.
export function pathProblem(path, site) {
  if (typeof path !== 'string') return 'a draft needs a path';
  const parts = path.split('/');
  const collection = parts.shift();
  if (!Object.values(site.types).some((type) => type.collection === collection && type.address)) return `no type with a page of its own keeps its posts in ${collection}`;
  const file = parts.pop() ?? '';
  if (!file.endsWith('.md') || !NAME.test(file.slice(0, -'.md'.length))) return `${file} is no post's file`;
  const several = site.languages.length > 1;
  if (parts.length !== (several ? 1 : 0)) return `${path} is not where a post's file lies`;
  if (several && !site.languages.some(({ tag }) => tag === parts[0])) return `${parts[0]} is no language of this site`;
  return null;
}

const IMAGE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

// An unsaved image as the service keeps it, { path, contents }, or a reason: `name`, the
// name it has in the draft, below /media/, and `data`, its bytes in base64.
export function unsavedImage({ name, data } = {}) {
  if (typeof name !== 'string' || !IMAGE.test(name)) return { reason: `${name} is no image's name` };
  if (typeof data !== 'string') return { reason: `the image ${name} has no contents` };
  return { path: `media/${name}`, contents: Buffer.from(data, 'base64') };
}

// A source file's key in the ledger: below its collection, without its extension.
export const keyOfPath = (path) => path.split('/').slice(1).join('/').slice(0, -'.md'.length);
