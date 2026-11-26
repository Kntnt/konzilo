// The fields of an article's parts in Sveltia: a text that shows what it falls back to while
// it is empty, and offers an optional part with a button; the slug, changed on purpose; and the
// structured data type, showing the type's own while the post has none. The check that a scheduled
// post waits for something still to come is its triggers' (schedule/register.js).
//
// A text field's settings in the configuration (config.js):
//   fallback: <rule>      the placeholder shows what the part falls back to, by a rule of
//                         article-parts.js: breadcrumb, teaserHeadline, teaserText,
//                         searchTitle, searchDescription, socialTitle or socialDescription;
//                         breadcrumb with the label of the menu entry that leads to the post,
//                         read from `menus`, the menus' files in order, or by the language tag
//                         of each pane (menu-label.js);
//                         searchTitle with the site's name and separator from the site's
//                         settings, and `separator`, the separator's default, where they
//                         give none;
//                         or ownAddress, the post's own address on the public site, from
//                         `address`, its type's with its tokens, or one by the language tag
//                         of each pane, while the post has a slug and no parent, filled with
//                         the form's values as they stand, the path of the term of each field
//                         `addressTerms` names read from the term files in the language folder
//                         `termFolder` (address.js)
//   add: <words>          an optional part: a button with the words until something is written
//   multiline: true       a text of several lines
//   placeholder: <words>  the placeholder of a field without a fallback, or while its
//                         fallback gives nothing
// The slug's: `address`, the type's address with its tokens, with `addressTerms` and
// `termFolder` as above, to open the post's page.
// The structured data type's: `options`, `type` and `typeLabel`, the post's type and its plural as
// it stands in a phrase, and `preset`, its type's structured data type until the site's settings
// say another.

import { breadcrumbOf, searchDescriptionOf, searchTitleOf, slugFrom, socialDescriptionOf, socialTitleOf, teaserHeadlineOf, teaserTextOf } from '../../format/article-parts.js';
import { say } from '../interface-language.js';
import { computedDefault } from '../groups/menu.js';
import { postValues } from '../groups/values.js';
import { signedInCredential } from '../credential.js';
import { sourceOf, sourceReader } from '../source.js';
import { filesOf, languageOf, readStatus } from '../publishing/status.js';
import { termIdOf } from '../../format/addresses.js';
import { formAddress, termPathReader } from './address.js';
import { menuLabelReader } from './menu-label.js';
import { SCHEMA_WIDGET, SLUG_WIDGET, TEXT_WIDGET } from './widgets.js';
import './form.css';
import { plain } from '../plain.js';

// A post's values, flat, with its field groups' as they are now (ADR 0071).
const dataOf = (entry) => postValues(entry?.get?.('data'));

// The site's settings in the source repository, read once.
function settingsReader(config) {
  const where = sourceOf(config);
  const source = sourceReader({ ...where, credential: signedInCredential });
  let asked = null;
  return () => {
    asked ??= (async () => {
      if (!where.api) return {};
      const text = await source.text('settings.json');
      return text === null ? {} : JSON.parse(text) ?? {};
    })().catch(() => ({}));
    return asked;
  };
}

export function registerParts(CMS, config) {
  const React = globalThis.__SVELTIA_CMS_REACT__;
  const h = React.createElement;
  const site = config.site_url;
  const readSettings = settingsReader(config);
  const menuLabelFor = menuLabelReader({ ...sourceOf(config), credential: signedInCredential });
  const termPathOf = termPathReader({ ...sourceOf(config), credential: signedInCredential });

  // The path of the term of each field a type's address holds, as the field's settings name
  // them, `addressTerms` and `termFolder`, by the field's name, from the form's values as they
  // stand, read again as a term is chosen.
  const useAddressTerms = (field, data) => {
    const wanted = plain(field.get('addressTerms')) ?? [];
    const folder = plain(field.get('termFolder')) ?? null;
    const ids = wanted.map(({ name }) => termIdOf(data?.[name]));
    const [terms, setTerms] = React.useState({});
    React.useEffect(() => {
      if (wanted.length === 0) return undefined;
      let gone = false;
      void Promise.all(wanted.map(({ collection }, at) => termPathOf(collection, ids[at], folder))).then((paths) => {
        if (!gone) setTerms(Object.fromEntries(wanted.map(({ name }, at) => [name, paths[at]]).filter(([, path]) => path)));
      });
      return () => {
        gone = true;
      };
    }, [ids.join('\n')]);
    return terms;
  };

  // The address the current release has for the post a form shows, by the publish status (ADR
  // 0031), in the language of the pane at `locale` on a site in several languages: read as the
  // form opens a post whose values hold no date while its type's address `template` holds one,
  // since only that address shows the moment the intake dated it by; null for a post the release
  // does not show.
  const useLiveAddress = (entry, template, locale = null) => {
    const id = entry?.get?.('slug') ?? '';
    const collection = entry?.get?.('collection') ?? '';
    const wanted = Boolean(id) && typeof template === 'string' && template.includes('{year}') && !dataOf(entry).date;
    const [posts, setPosts] = React.useState([]);
    React.useEffect(() => {
      if (!wanted) return undefined;
      let gone = false;
      void readStatus({ credential: signedInCredential }).then((status) => {
        if (!gone && status) setPosts(filesOf(status.posts, collection, id));
      });
      return () => {
        gone = true;
      };
    }, [wanted, collection, id]);
    const post = posts.length === 1 ? posts[0] : posts.find((one) => languageOf(one) === locale);
    return post && (post.status === 'live' || post.stillShown) ? post.address ?? null : null;
  };

  // What each part left empty falls back to. A field's own value is left out, so that the
  // placeholder shows the part's default and not what is written.
  const RULES = {
    breadcrumb: (data, { menuLabel }) => breadcrumbOf({ ...data, breadcrumb: '' }, menuLabel),
    teaserHeadline: (data) => teaserHeadlineOf({ ...data, teaser: { ...data.teaser, headline: '' } }),
    teaserText: (data) => teaserTextOf({ ...data, teaser: { ...data.teaser, text: '' } }),
    searchTitle: (data, { name, separator }) => searchTitleOf(data, name, separator),
    searchDescription: (data) => searchDescriptionOf(data),
    socialTitle: (data) => socialTitleOf(data),
    socialDescription: (data) => socialDescriptionOf(data),
    // A post below another has its parents' slugs in its address, which the form does not hold.
    ownAddress: (data, { template, terms, live }) => formAddress(site, template, data, { terms, live }),
  };

  CMS.registerFieldType(TEXT_WIDGET, function KonziloText({ value, onChange, field, forID, entry }) {
    const fallback = plain(field.get('fallback'));
    const add = plain(field.get('add'));
    const multiline = plain(field.get('multiline')) === true;
    const [open, setOpen] = React.useState(Boolean(value));
    const [name, setName] = React.useState('');
    const [separator, setSeparator] = React.useState(plain(field.get('separator')) ?? '');
    const [locale, setLocale] = React.useState(null);
    const [menuLabel, setMenuLabel] = React.useState('');
    const input = React.useRef(null);
    const composing = React.useRef(false);
    const terms = useAddressTerms(field, dataOf(entry));
    const address = plain(field.get('address'));
    const template = typeof address === 'string' ? address : address?.[locale];
    const live = useLiveAddress(entry, template, locale);
    // The language of the pane the field is in, on a site in several languages.
    React.useEffect(() => {
      setLocale(input.current?.closest('[data-locale]')?.dataset.locale ?? null);
    }, [open]);
    React.useEffect(() => {
      if (fallback !== 'searchTitle') return undefined;
      let gone = false;
      void readSettings().then((settings) => {
        if (gone) return;
        setName(settings.title ?? '');
        // A settings file holds a setting only where it differs from its default.
        const own = settings.search?.separator;
        if (typeof own === 'string' && own.trim() !== '') setSeparator(own);
      });
      return () => {
        gone = true;
      };
    }, [fallback]);
    // The label of the menu entry that leads to the post, in the pane's language, as the form
    // first shows the field; none for a new post, which no menu names yet.
    const menus = plain(field.get('menus'));
    const id = entry?.get?.('slug') ?? '';
    React.useEffect(() => {
      if (fallback !== 'breadcrumb' || !menus || !id) return undefined;
      const files = Array.isArray(menus) ? menus : menus[locale] ?? [];
      let gone = false;
      void menuLabelFor(id, files).then((label) => {
        if (!gone) setMenuLabel(label);
      });
      return () => {
        gone = true;
      };
    }, [fallback, id, locale]);
    React.useEffect(() => {
      if (open && add && !value) input.current?.focus();
    }, [open]);
    // An optional part emptied from the field's menu is a button again.
    React.useEffect(() => {
      if (add && !value && document.activeElement !== input.current) setOpen(false);
    }, [value]);
    // The field holds what is typed, and Sveltia's value reaches it only when it differs and
    // nothing is being composed. A controlled field would be set back to Sveltia's last value at
    // each key, before Sveltia's value comes round, and that ends a composition, a dead key's ´
    // before e, leaving the mark as a character of its own. What is composed goes when done.
    React.useEffect(() => {
      const shown = input.current;
      if (shown && !composing.current && shown.value !== (value ?? '')) shown.value = value ?? '';
    }, [value, open]);
    if (add && !value && !open) {
      return h('button', { type: 'button', id: forID, className: 'konzilo-part-add', onClick: () => setOpen(true) }, `+ ${add}`);
    }
    const placeholder = (fallback && RULES[fallback] ? RULES[fallback](dataOf(entry), { name, separator, menuLabel, template, terms, live }) : '') || (plain(field.get('placeholder')) ?? '');
    return h(multiline ? 'textarea' : 'input', {
      ref: input,
      id: forID,
      'aria-label': plain(field.get('label')),
      className: multiline ? 'konzilo-part-input konzilo-part-lines' : 'konzilo-part-input',
      defaultValue: value ?? '',
      placeholder,
      rows: multiline ? 3 : undefined,
      type: multiline ? undefined : 'text',
      onCompositionStart: () => {
        composing.current = true;
      },
      onCompositionEnd: (event) => {
        composing.current = false;
        onChange(event.target.value);
      },
      onChange: (event) => {
        if (!composing.current && !event.nativeEvent?.isComposing) onChange(event.target.value);
      },
      onBlur: () => {
        if (add && !value) setOpen(false);
      },
    });
  });

  // The slug: shown, and changed only on purpose, with a button that makes it editable and then
  // saves it, and a link to the post's page. A new post's follows its name in breadcrumbs, its
  // title by default, until it is changed, and an emptied slug is that proposal again.
  CMS.registerFieldType(SLUG_WIDGET, function KonziloSlug({ value, onChange, field, forID, entry }) {
    const address = plain(field.get('address'));
    const proposed = computedDefault('slug', dataOf(entry));
    const terms = useAddressTerms(field, dataOf(entry));
    const live = useLiveAddress(entry, address);
    const following = React.useRef(!value);
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState(value ?? '');
    React.useEffect(() => {
      if (following.current && proposed && proposed !== value) onChange(proposed);
    }, [proposed]);
    React.useEffect(() => {
      setEditing(false);
      if (value) return;
      following.current = true;
      if (proposed) onChange(proposed);
    }, [value]);
    const page = formAddress(site, address, { ...dataOf(entry), slug: value }, { terms, live });
    const press = () => {
      if (!editing) {
        setDraft(value ?? '');
        setEditing(true);
        return;
      }
      const made = slugFrom(draft);
      following.current = false;
      setEditing(false);
      if (made && made !== value) onChange(made);
    };
    return h('div', { className: 'konzilo-part-slug' },
      h('input', {
        id: forID,
        'aria-label': plain(field.get('label')),
        className: 'konzilo-part-input',
        type: 'text',
        value: editing ? draft : value ?? '',
        readOnly: !editing,
        onChange: (event) => setDraft(event.target.value),
        onKeyDown: (event) => {
          if (editing && event.key === 'Enter') {
            event.preventDefault();
            press();
          }
        },
      }),
      h('button', { type: 'button', className: 'konzilo-part-button', onClick: press }, say(editing ? 'parts.slugSave' : 'parts.slugChange')),
      page ? h('a', { className: 'konzilo-part-button', href: page, target: '_blank', rel: 'noopener' }, say('parts.slugShow')) : null);
  });

  // The structured data type, among those the post's type offers: the type's own shows as
  // chosen while the post has none, and choosing it again leaves the post with none, so that a
  // later change of the type's setting reaches it. The type's own is the settings' choice where
  // the type offers it, else its default, the first it offers, as the build takes it.
  CMS.registerFieldType(SCHEMA_WIDGET, function KonziloSchema({ value, onChange, field, forID }) {
    const options = plain(field.get('options')) ?? [];
    const type = plain(field.get('type'));
    const typeLabel = plain(field.get('typeLabel')) ?? '';
    const [preset, setPreset] = React.useState(plain(field.get('preset')) ?? '');
    React.useEffect(() => {
      let gone = false;
      void readSettings().then((settings) => {
        const chosen = settings.search?.types?.[type]?.schema;
        if (!gone && options.includes(chosen)) setPreset(chosen);
      });
      return () => {
        gone = true;
      };
    }, [type]);
    // A stored choice the type does not offer shows as the type's own, which the build takes.
    const shown = value && value !== preset && options.includes(value) ? value : '';
    return h('select', { id: forID, className: 'konzilo-part-input konzilo-part-select', value: shown, onChange: (event) => onChange(event.target.value) },
      options.map((one) => (one === preset
        ? h('option', { key: one, value: '' }, say('parts.schemaPreset', { type: one, plural: typeLabel }))
        : h('option', { key: one, value: one }, one))));
  });
}
