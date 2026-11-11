// The fields of an article's parts in Sveltia: a text that shows what it falls back to while
// it is empty, and offers an optional part with a button; the slug, changed on purpose; the
// structured data type, showing the type's own while the post has none; and the check that a
// scheduled post is scheduled for later.
//
// A text field's settings in the configuration (config.js):
//   fallback: <rule>      the placeholder shows what the part falls back to, by a rule of
//                         article-parts.js: breadcrumb, teaserHeadline, teaserText,
//                         searchTitle, searchDescription, socialTitle or socialDescription;
//                         or ownAddress, the post's own address on the public site, from
//                         `address`, its type's with {slug}, or one by the language tag of
//                         each pane, while the post has a slug and no parent
//   add: <words>          an optional part: a button with the words until something is written
//   multiline: true       a text of several lines
//   placeholder: <words>  the placeholder of a field without a fallback, or while its
//                         fallback gives nothing
// The slug's: `address`, the type's address with {slug}, to open the post's page.
// The structured data type's: `options`, `type` and `typeLabel`, the post's type and its plural as
// it stands in a phrase, and `preset`, its type's structured data type until the site's settings
// say another.

import { breadcrumbOf, searchDescriptionOf, searchTitleOf, slugFrom, socialDescriptionOf, socialTitleOf, teaserHeadlineOf, teaserTextOf } from '../../format/article-parts.js';
import { say } from '../body/texts.js';
import { computedDefault } from '../groups/menu.js';
import { postValues } from '../groups/values.js';
import { signedInCredential } from '../credential.js';
import { SCHEMA_WIDGET, SLUG_WIDGET, TEXT_WIDGET } from './widgets.js';
import './form.css';

const plain = (value) => (value?.toJS ? value.toJS() : value);
// A post's values, flat, with its field groups' as they are now (ADR 0071).
const dataOf = (entry) => postValues(entry?.get?.('data'));

// The site's settings in the source repository, read once.
function settingsReader(config) {
  const { api_root: api, repo: repository, branch = 'main' } = config.backend;
  let asked = null;
  return () => {
    asked ??= (async () => {
      const held = signedInCredential();
      if (!api || !held) return {};
      const answer = await fetch(`${api}/repos/${repository}/contents/settings.json?ref=${encodeURIComponent(branch)}`, { headers: { authorization: held } });
      if (!answer.ok) return {};
      const file = await answer.json();
      const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), (character) => character.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)) ?? {};
    })().catch(() => ({}));
    return asked;
  };
}

// A post's address on the public site, from its type's address and its slug, where the
// address holds the slug alone.
const addressOf = (site, address, slug) => (typeof address === 'string' && address.includes('{slug}') && slug ? new URL(address.replace('{slug}', slug), site).href : '');

export function registerParts(CMS, config) {
  const React = globalThis.__SVELTIA_CMS_REACT__;
  const h = React.createElement;
  const site = config.site_url;
  const readSettings = settingsReader(config);

  // What each part left empty falls back to. A field's own value is left out, so that the
  // placeholder shows the part's default and not what is written.
  const RULES = {
    breadcrumb: (data) => breadcrumbOf({ ...data, breadcrumb: '' }),
    teaserHeadline: (data) => teaserHeadlineOf({ ...data, teaser: { ...data.teaser, headline: '' } }),
    teaserText: (data) => teaserTextOf({ ...data, teaser: { ...data.teaser, text: '' } }),
    searchTitle: (data, { name }) => searchTitleOf(data, name),
    searchDescription: (data) => searchDescriptionOf(data),
    socialTitle: (data) => socialTitleOf(data),
    socialDescription: (data) => socialDescriptionOf(data),
    // A post below another has its parents' slugs in its address, which the form does not hold.
    ownAddress: (data, { address, locale }) => {
      const own = typeof address === 'string' ? address : address?.[locale];
      return own && data.slug && !data.parent ? addressOf(site, own, data.slug) : '';
    },
  };

  CMS.registerFieldType(TEXT_WIDGET, function KonziloText({ value, onChange, field, forID, entry }) {
    const fallback = plain(field.get('fallback'));
    const add = plain(field.get('add'));
    const multiline = plain(field.get('multiline')) === true;
    const [open, setOpen] = React.useState(Boolean(value));
    const [name, setName] = React.useState('');
    const [locale, setLocale] = React.useState(null);
    const input = React.useRef(null);
    const composing = React.useRef(false);
    // The language of the pane the field is in, on a site in several languages.
    React.useEffect(() => {
      setLocale(input.current?.closest('[data-locale]')?.dataset.locale ?? null);
    }, [open]);
    React.useEffect(() => {
      if (fallback !== 'searchTitle') return undefined;
      let gone = false;
      void readSettings().then((settings) => {
        if (!gone) setName(settings.title ?? '');
      });
      return () => {
        gone = true;
      };
    }, [fallback]);
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
    const placeholder = (fallback && RULES[fallback] ? RULES[fallback](dataOf(entry), { name, address: plain(field.get('address')), locale }) : '') || (plain(field.get('placeholder')) ?? '');
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
    const page = addressOf(site, address, value);
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

  // The structured data type: the type's own shows as chosen while the post has none, and
  // choosing it again leaves the post with none, so that a later change of the type's setting
  // reaches it.
  CMS.registerFieldType(SCHEMA_WIDGET, function KonziloSchema({ value, onChange, field, forID }) {
    const options = plain(field.get('options')) ?? [];
    const type = plain(field.get('type'));
    const typeLabel = plain(field.get('typeLabel')) ?? '';
    const [preset, setPreset] = React.useState(plain(field.get('preset')) ?? '');
    React.useEffect(() => {
      let gone = false;
      void readSettings().then((settings) => {
        const chosen = settings.search?.types?.[type]?.schema;
        if (!gone && chosen) setPreset(chosen);
      });
      return () => {
        gone = true;
      };
    }, [type]);
    return h('select', { id: forID, className: 'konzilo-part-input konzilo-part-select', value: value && value !== preset ? value : '', onChange: (event) => onChange(event.target.value) },
      options.map((one) => (one === preset
        ? h('option', { key: one, value: '' }, say('parts.schemaPreset', { type: one, plural: typeLabel }))
        : h('option', { key: one, value: one }, one))));
  });

  // A scheduled post is published at its moment, which must lie ahead. The words above the
  // reason are the early check's, since nothing failed.
  let refusal = null;
  const earlier = globalThis.__KONZILO_REFUSAL_WORDS__;
  globalThis.__KONZILO_REFUSAL_WORDS__ = (shown) => (refusal !== null && shown === refusal ? say('body.refused') : earlier?.(shown));
  CMS.registerEventListener({
    name: 'preSave',
    handler: ({ entry }) => {
      const data = postValues(entry.get('data'));
      if (data.status !== 'scheduled') return;
      const moment = Date.parse(data.date ?? '');
      if (Number.isFinite(moment) && moment > Date.now()) return;
      refusal = say('parts.scheduledAhead');
      throw new Error(refusal);
    },
  });
}
