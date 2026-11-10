// Sveltia's configuration, made from the site description and the settings
// groups, so that nothing is stored that could drift (ADR 0029), in one interface
// language: its labels are the core's catalogues' in that language, and the
// site's own as the site description gives them in it (ADR 0066). The source files
// it reads and writes are those ADR 0026 names: a post or a term under its
// collection's folder, named by an ID that never changes, and a reference by that
// ID. Empty optional fields are left out, since the intake's schemas refuse an
// empty string.

import { AUTHORS, builtInOf, followsParts, PAGE } from '../format/built-in-types.js';
import { IMAGE_LIBRARY_FOLDER } from '../format/masters.js';
import { declaredNames, SCHEMA_TYPES } from '../site-description.js';
import settingsGroups from '../format/settings-groups.json' with { type: 'json' };
import { SHARING_SAFE, SHARING_SIZE } from '../format/article-parts.js';
import { IMAGE_WIDGET } from './image/widget.js';
import { STRUCTURE_WIDGET } from './structure/widget.js';
import { SCHEMA_WIDGET, SLUG_WIDGET, TEXT_WIDGET } from './parts/widgets.js';
import { labelIn, text } from '../catalogues.js';
import { inLanguage } from '../texts.js';
import { BODY_WIDGET } from './body/widget.js';
import { PUBLISHING_WIDGET } from './publishing/widget.js';

// How deep a menu's entries go in the form. Sveltia has no recursive field.
const MENU_DEPTH = 3;

const SLUG = { template: '{{uuid_short}}', editable: false };

// A field on a site in several languages: written per language, or kept alike.
const TRANSLATED = { i18n: true };
const SAME_IN_EACH = { i18n: 'duplicate' };

/**
 * @param {object} description the form siteDescription() returns
 * @param {object} place where this copy of the site is
 * @param {string} place.forgejo Forgejo's public origin
 * @param {string} place.repository `<organisation>/<repository>`
 * @param {string} place.clientId the OAuth client of this Forgejo
 * @param {string} place.site the public site's origin
 * @param {string} [place.language] the interface language, by default the site's
 */
export function cmsConfig(description, { forgejo, repository, clientId, site, preview = null, language: interfaceLanguage = description.interfaceLanguage }) {
  const say = (key, values) => text(interfaceLanguage, `form.${key}`, values);
  // A label of the site's own, as its site description gives it, in the interface language.
  const own = (label) => labelIn(label, interfaceLanguage);
  const several = description.languages.length > 1;
  const within = (extra) => (several ? extra : {});
  const { forms } = declaredNames(description);

  const required = (field) => ({ required: field === true });

  // An image from the image library, the one place an editor finds images, with its alt text
  // copied in where the field has one (image/register.js). Its value is { src, alt }, as the
  // source holds it.
  const smallest = description.images?.smallestWidth ? { smallestWidth: description.images.smallestWidth } : {};
  // On a site in several languages its value is each language's, so that the alt text is too.
  const imageField = (name, label, extra = {}, withAlt = true) => ({
    name,
    label: own(label),
    widget: IMAGE_WIDGET,
    alt: withAlt,
    ...smallest,
    ...extra,
    ...(withAlt ? within(TRANSLATED) : {}),
  });

  // The post a choice of one leads to. A relation names one collection, so a choice
  // of a post is among the built-in pages where the site has them, and otherwise among
  // the first type with an address.
  const chooseAmong = () => {
    const types = Object.values(description.types).filter((type) => type.address !== null);
    return types.find((type) => builtInOf(type) === PAGE) ?? types[0] ?? null;
  };

  // Nothing is made from inside another's form, but for a post's terms, where a new one is
  // what the choice is for.
  const relation = (collection, display, extra = {}) => ({
    widget: 'relation',
    collection,
    value_field: '{{slug}}',
    display_fields: [display],
    search_fields: [display],
    allow_add: false,
    ...extra,
  });

  // A value's field, by the type and control it is declared with.
  const valueField = (setting) => {
    const common = {
      name: setting.name,
      label: own(setting.label),
      required: setting.required === true,
      ...(setting.help ? { hint: setting.help } : {}),
    };
    // A default that says where its value comes from, such as the site's title, is
    // the intake's to resolve; Sveltia takes only a plain value.
    const given = ['string', 'number', 'boolean'].includes(typeof setting.default) ? { default: setting.default } : {};
    switch (setting.type) {
      case 'number':
        return { ...common, ...given, widget: 'number', value_type: 'float' };
      case 'integer':
        return { ...common, ...given, widget: 'number', value_type: 'int' };
      case 'boolean':
        return { ...common, ...given, widget: 'boolean', required: false };
      case 'date':
        return { ...common, ...given, widget: 'datetime', time_format: false, format: 'YYYY-MM-DD' };
      case 'post': {
        const among = chooseAmong();
        return among === null
          ? { ...common, widget: 'string' }
          : { ...common, ...relation(among.collection, 'title'), required: false };
      }
      case 'image':
        return imageField(setting.name, setting.label, { required: false });
      default:
        if (setting.control === 'select') return { ...common, ...given, widget: 'select', options: setting.options };
        return { ...common, ...given, widget: setting.control === 'textarea' ? 'text' : 'string' };
    }
  };

  // A setting that is translated holds a text per language on a site in several.
  const settingField = (setting) => {
    if (!setting.translated || !several) return valueField(setting);
    return {
      name: setting.name,
      label: own(setting.label),
      widget: 'object',
      required: false,
      fields: description.languages.map((language) => valueField({
        ...setting,
        name: language.locale,
        label: language.tag,
        translated: false,
        default: setting.defaults ? inLanguage(setting.defaults, language.locale) : setting.default,
      })),
    };
  };

  const settingFields = (settings) => settings.filter((setting) => setting.published !== false).map(settingField);

  const part = (name, label, hint, fields) => ({
    name,
    label: own(label),
    widget: 'object',
    required: false,
    accordion: true,
    collapsed: true,
    ...(hint ? { hint } : {}),
    fields,
  });

  const groupField = (group) => {
    const parts = [
      ...settingFields(group.settings),
      ...group.parts.map((one) => part(one.name, one.label, one.description, settingFields(one.settings))),
      ...(group.types === null ? [] : [part('types', say('perType'), null, group.types.map((one) => part(one.type, one.label, null, settingFields(one.settings))))]),
      ...(group.each ?? []).map((one) => part(one.name, one.label, null, settingFields(one.settings))),
    ];
    return part(group.name, group.label, group.description, parts);
  };

  // Search, sharing and structured data: three groups of the source's own, beside the
  // post's fields, closed, since an editor who sets none of it leaves the defaults to say it
  // (ADR 0029). The content file holds them as one map (the intake's seoValue()).
  // The type's structured data type as the settings give it before a site sets its own.
  const schemaPreset = (type) => {
    const { default: preset, defaultFor = {} } = settingsGroups.search.types.settings.schema;
    const kinds = { address: type.address !== null, date: type.fields.some((field) => field.kind === 'date'), page: builtInOf(type) === PAGE };
    const kind = Object.keys(defaultFor).find((one) => kinds[one]);
    return kind === undefined ? preset : defaultFor[kind];
  };

  // An article, and a post of the site's own type that has a teaser, shows in its search
  // and sharing fields what its teaser shows, as its head does (article-parts.js); another
  // type's leave it to its templates.
  const seoFields = (type) => {
    const teaser = followsParts(type);
    const shown = (rule) => (teaser ? { widget: TEXT_WIDGET, fallback: rule } : { hint: say('seoFollows') });
    const group = (name, fields) => ({
      name,
      label: say(name),
      widget: 'object',
      required: false,
      accordion: true,
      collapsed: true,
      ...within(TRANSLATED),
      fields: fields.map((one) => ({ required: false, ...one, ...within(TRANSLATED) })),
    });
    return [
      group('search', [
        { name: 'title', label: say('seoTitle'), widget: 'string', ...shown('searchTitle') },
        { name: 'description', label: say('seoDescription'), widget: 'text', ...(teaser ? { widget: TEXT_WIDGET, multiline: true, fallback: 'searchDescription' } : {}) },
        { name: 'noindex', label: say('seoNoindex'), widget: 'boolean' },
        { name: 'nofollow', label: say('seoNofollow'), widget: 'boolean' },
      ]),
      group('sharing', [
        imageField('image', say('seoSocialImage'), { required: false, crop: [SHARING_SIZE.width, SHARING_SIZE.height], safe: [SHARING_SAFE.width, SHARING_SAFE.height], ...(type.fields.some((field) => field.kind === 'image') ? { fallback: true } : {}) }),
        { name: 'title', label: say('seoSocialTitle'), widget: 'string', ...shown('socialTitle') },
        { name: 'description', label: say('seoSocialDescription'), widget: 'text', ...(teaser ? { widget: TEXT_WIDGET, multiline: true, fallback: 'socialDescription' } : {}) },
      ]),
      group('structured', [
        { name: 'schema', label: say('seoSchema'), widget: SCHEMA_WIDGET, options: [...SCHEMA_TYPES], type: type.name, typeLabel: own(type.plural), preset: schemaPreset(type) },
      ]),
    ];
  };

  // The teaser: what shows the post elsewhere, closed until an editor wants it otherwise.
  const teaserField = (field) => ({
    name: field.name,
    label: say('teaser'),
    widget: 'object',
    required: false,
    accordion: true,
    collapsed: true,
    ...within(TRANSLATED),
    fields: [
      imageField('image', say('file'), { required: false, fallback: true }),
      { name: 'headline', label: say('teaserHeadline'), widget: TEXT_WIDGET, fallback: 'teaserHeadline', required: false },
      { name: 'text', label: say('teaserText'), widget: TEXT_WIDGET, multiline: true, fallback: 'teaserText', required: false },
    ],
  });

  // A part of an article that is a text: its field, which shows what it falls back to, or is
  // a button until it is wanted.
  const PARTS = {
    breadcrumb: { widget: TEXT_WIDGET, fallback: 'breadcrumb', hint: say('breadcrumbHint') },
    eyebrow: { widget: TEXT_WIDGET, add: say('addEyebrow'), placeholder: say('eyebrow') },
    headline: { widget: TEXT_WIDGET, placeholder: say('headline') },
    subheadline: { widget: TEXT_WIDGET, add: say('addSubheadline'), placeholder: say('subheadline') },
    standfirst: { widget: 'text' },
  };

  const postField = (field, type) => {
    switch (field.kind) {
      case 'date':
        return { name: 'date', label: say('date'), widget: 'datetime', required: false, picker_utc: true, ...within(SAME_IN_EACH) };
      case 'modified':
        return null;
      case 'excerpt':
        return { name: 'excerpt', label: say('excerpt'), widget: 'text', ...required(field.required), ...within(TRANSLATED) };
      case 'image':
        return imageField('image', say('image'), { required: field.required === true, ...within(SAME_IN_EACH) });
      case 'seo':
        return seoFields(type);
      case 'teaser':
        return teaserField(field);
      case 'breadcrumb':
      case 'eyebrow':
      case 'headline':
      case 'subheadline':
      case 'standfirst': {
        return { name: field.name, label: say(field.kind), ...PARTS[field.kind], ...required(field.required), ...within(TRANSLATED) };
      }
      case 'terms':
        // A field of one term at most is one choice or none, and its source holds a text.
        return {
          name: field.name,
          label: own(field.most === 1 ? field.taxonomy.label : field.taxonomy.plural),
          ...relation(field.taxonomy.collection, 'name', { allow_add: true }),
          multiple: field.most !== 1,
          ...(field.most > 1 ? { max: field.most } : {}),
          ...required(field.required),
          ...within(SAME_IN_EACH),
        };
      default:
        return valueField({ ...field, type: field.type, control: field.control });
    }
  };

  // What else answers with a post: a redirect to it, or the post shown there too. Rules
  // the site keeps are the Redirects page's (ADR 0036).
  const otherAddressesField = () => ({
    name: 'otherAddresses',
    label: say('otherAddresses'),
    label_singular: say('otherAddress'),
    widget: 'list',
    required: false,
    collapsed: true,
    ...within(SAME_IN_EACH),
    fields: [
      { name: 'address', label: say('otherPath'), widget: 'string', hint: say('otherPathHint'), pattern: ['^/(?!/)\\S*$', say('otherPathPattern')] },
      {
        name: 'answer',
        label: say('answer'),
        widget: 'select',
        default: '301',
        options: ['301', '302', '307', '308'].map((value) => ({ value, label: value })).concat({ value: 'show', label: say('otherShow') }),
      },
    ],
  });

  const typeCollection = (type) => ({
    name: type.collection,
    label: own(type.plural),
    label_singular: own(type.label),
    folder: type.collection,
    extension: 'md',
    format: 'yaml-frontmatter',
    create: true,
    identifier_field: 'title',
    summary: '{{title}}',
    slug: SLUG,
    ...within(TRANSLATED),
    fields: [
      // What an editor is here for first, and in sight when the entry opens, as Sveltia mounts
      // what lies further down only as it comes into view.
      // Where the type has a main headline of its own, the title is the post's working name.
      type.fields.some((field) => field.kind === 'headline')
        ? { name: 'title', label: say('workingName'), hint: say('workingNameHint'), widget: 'string', ...within(TRANSLATED) }
        : { name: 'title', label: say('title'), widget: 'string', ...within(TRANSLATED) },
      {
        name: 'status',
        label: say('status'),
        widget: 'select',
        default: 'draft',
        options: ['draft', 'scheduled', 'published'].map((value) => ({ value, label: say(value) })),
        ...within(SAME_IN_EACH),
      },
      // How it stands on the site, which is nothing the file holds (ADR 0031).
      { name: 'publishing', label: say('publishing'), widget: PUBLISHING_WIDGET, required: false, ...within(SAME_IN_EACH) },
      { name: 'body', label: say('body'), widget: type.editor === 'structure' ? STRUCTURE_WIDGET : BODY_WIDGET, required: false, elements: type.elements, forms, ...(description.images?.smallestWidth ? { smallestWidth: description.images.smallestWidth } : {}), ...within(TRANSLATED) },
      // Shown, and changed on purpose; a new post's follows its name in breadcrumbs.
      { name: 'slug', label: say('slug'), widget: SLUG_WIDGET, address: typeof type.address === 'string' ? type.address : null, required: false, ...within(SAME_IN_EACH) },
      ...(type.hierarchical
        ? [{ name: 'parent', label: say('parent'), ...relation(type.collection, 'title'), required: false, ...within(SAME_IN_EACH) }]
        : []),
      ...type.fields.flatMap((field) => postField(field, type) ?? []),
      ...(type.address === null ? [] : [otherAddressesField()]),
    ],
  });

  const taxonomyCollection = (taxonomy) => ({
    name: taxonomy.collection,
    label: own(taxonomy.plural),
    label_singular: own(taxonomy.label),
    folder: taxonomy.collection,
    extension: 'json',
    format: 'json',
    create: true,
    identifier_field: 'name',
    summary: '{{name}}',
    slug: SLUG,
    ...within(TRANSLATED),
    fields: [
      { name: 'name', label: say('name'), widget: 'string', ...within(TRANSLATED) },
      { name: 'slug', label: say('slug'), widget: 'string', required: false, hint: say('slugHint'), ...within(SAME_IN_EACH) },
      ...(taxonomy.hierarchical
        ? [{ name: 'parent', label: say('parent'), ...relation(taxonomy.collection, 'name'), required: false, ...within(SAME_IN_EACH) }]
        : []),
      // An author's description is the biography an author page shows.
      { name: 'description', label: say(taxonomy.builtIn === AUTHORS ? 'biography' : 'description'), widget: 'text', required: false, ...within(TRANSLATED) },
    ],
  });

  // What an editor chooses from in a body (ADR 0055): no type, no page, and in one language, since
  // what a post holds of it is the post's own.
  const imageLibraryCollection = () => ({
    name: IMAGE_LIBRARY_FOLDER,
    label: say('imageLibrary'),
    label_singular: say('libraryImage'),
    folder: IMAGE_LIBRARY_FOLDER,
    format: 'json',
    extension: 'json',
    create: true,
    identifier_field: 'alt',
    summary: '{{alt}}',
    thumbnail: 'src',
    slug: SLUG,
    fields: [
      // The entry's own file, which a new entry uploads, and is chosen from nowhere else.
      { name: 'src', label: say('file'), widget: IMAGE_WIDGET, text: true, upload: true, required: true, ...smallest },
      { name: 'alt', label: say('alt'), widget: 'string', required: true, hint: say('libraryHint') },
      { name: 'caption', label: say('caption'), widget: 'string', required: false },
    ],
  });

  const among = chooseAmong();
  const entryFields = (depth) => [
    { name: 'title', label: say('label'), widget: 'string', required: false, hint: say('labelHint') },
    ...(among === null ? [] : [{ name: 'post', label: say('post'), ...relation(among.collection, 'title'), required: false }]),
    { name: 'url', label: say('url'), widget: 'string', required: false, hint: say('urlHint') },
    ...(depth > 1 ? [entriesField(depth - 1)] : []),
  ];
  const entriesField = (depth) => ({
    name: 'items',
    label: say('entries'),
    label_singular: say('entry'),
    widget: 'list',
    required: false,
    collapsed: true,
    fields: entryFields(depth),
  });

  const menus = Object.values(description.menus);

  // The site's components, their labels and their attributes' in the interface language.
  const components = Object.fromEntries(Object.entries(description.components).map(([name, component]) => [name, {
    ...component,
    label: own(component.label),
    attributes: Object.fromEntries(Object.entries(component.attributes).map(([attribute, setting]) => [attribute, setting.label === undefined ? setting : { ...setting, label: own(setting.label) }])),
  }]));

  return {
    load_config_file: false,
    // Konzilo's own, which the editor takes out before Sveltia sees the rest: the interface
    // language this configuration is in, where this copy of the site has its live preview,
    // and which collections have pages to show there, and the site's own components, which
    // its bodies may hold beside the core's elements.
    konzilo: {
      language: interfaceLanguage,
      ...(preview === null ? {} : { preview: { origin: preview, collections: Object.values(description.types).filter((type) => type.address).map((type) => type.collection) } }),
      ...(Object.keys(components).length === 0 ? {} : { components }),
    },
    app_title: 'Konzilo',
    site_url: site,
    display_url: site,
    backend: {
      name: 'forgejo',
      repo: repository,
      branch: 'main',
      base_url: forgejo,
      api_root: `${forgejo}/api/v1`,
      app_id: clientId,
      auth_methods: ['oauth'],
    },
    publish_mode: 'simple',
    media_folder: 'media',
    public_folder: '/media',
    media_libraries: { stock_assets: { providers: [] } },
    output: { omit_empty_optional_fields: true, json: { indent_style: 'space', indent_size: 2 } },
    ...(several
      ? {
          i18n: {
            structure: 'multiple_folders',
            locales: description.languages.map((language) => language.tag),
            default_locale: description.languages.find((language) => language.main).tag,
            canonical_slug: { key: 'translationKey', value: '{{slug}}' },
          },
        }
      : {}),
    collections: [
      ...Object.values(description.types).map(typeCollection),
      ...Object.values(description.taxonomies).map(taxonomyCollection),
      // Every image field chooses from it, the site's logo among them.
      imageLibraryCollection(),
      {
        name: 'settings',
        label: say('settings'),
        files: [
          {
            name: 'settings',
            label: say('settings'),
            file: 'settings.json',
            format: 'json',
            fields: [
              { name: 'title', label: say('siteTitle'), widget: 'string', required: false },
              imageField('logo', say('logo'), { required: false }),
              imageField('icon', say('icon'), { required: false }, false),
              ...settingFields(description.settings),
              ...description.groups.map(groupField),
            ],
          },
        ],
      },
      ...(menus.length === 0
        ? []
        : [
            {
              name: 'menus',
              label: say('menus'),
              files: menus.flatMap((menu) => (several ? description.languages : [null]).map((language) => ({
                name: language ? `${menu.name}-${language.tag}` : menu.name,
                label: language ? say('menuInLanguage', { menu: own(menu.label), language: language.tag }) : own(menu.label),
                file: language ? `menus/${language.tag}/${menu.name}.json` : `menus/${menu.name}.json`,
                format: 'json',
                fields: [entriesField(MENU_DEPTH)],
              }))),
            },
          ]),
    ],
  };
}
