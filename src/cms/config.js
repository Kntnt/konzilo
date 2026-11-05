// Sveltia's configuration, made from the site description and the settings
// groups, so that nothing is stored that could drift (ADR 0029). The source files
// it reads and writes are those ADR 0026 names: a post or a term under its
// collection's folder, named by an ID that never changes, and a reference by that
// ID. Empty optional fields are left out, since the intake's schemas refuse an
// empty string.

import { IMAGE_LIBRARY_FOLDER } from '../format/masters.js';
import { declaredNames, SCHEMA_TYPES, SEO_PARTS } from '../site-description.js';
import { inLanguage } from '../texts.js';
import { BODY_WIDGET } from './body/widget.js';
import { PUBLISHING_WIDGET } from './publishing/widget.js';

const TEXTS = {
  title: { en: 'Title', sv: 'Titel' },
  slug: { en: 'Slug', sv: 'Slug' },
  slugHint: { en: 'The last part of the address. Made from the title if left empty.', sv: 'Sista delen av adressen. Skapas av titeln om du lämnar den tom.' },
  parent: { en: 'Parent', sv: 'Förälder' },
  status: { en: 'Status', sv: 'Status' },
  publishing: { en: 'Publishing', sv: 'Publicering' },
  draft: { en: 'Draft', sv: 'Utkast' },
  scheduled: { en: 'Scheduled', sv: 'Schemalagd' },
  published: { en: 'Published', sv: 'Publicerad' },
  date: { en: 'Date', sv: 'Datum' },
  excerpt: { en: 'Excerpt', sv: 'Utdrag' },
  image: { en: 'Featured image', sv: 'Utvald bild' },
  file: { en: 'Image', sv: 'Bild' },
  alt: { en: 'Alt text', sv: 'Alternativtext' },
  body: { en: 'Body', sv: 'Brödtext' },
  name: { en: 'Name', sv: 'Namn' },
  description: { en: 'Description', sv: 'Beskrivning' },
  seo: { en: 'Search and sharing', sv: 'Sök och delning' },
  seoPartSearch: { en: 'In search results', sv: 'I sökresultat' },
  seoPartSharing: { en: 'When shared', sv: 'När det delas' },
  seoPartAdvanced: { en: 'Advanced', sv: 'Avancerat' },
  seoFollows: { en: 'Left empty, the template for this type of post decides.', sv: 'Lämnas den tom bestämmer mallen för den här inläggstypen.' },
  seoImageAltHint: { en: 'Needed with a sharing image.', sv: 'Krävs när det finns en delningsbild.' },
  seoTitle: { en: 'Title tag', sv: 'Titeltagg' },
  seoBreadcrumb: { en: 'Name in breadcrumbs', sv: 'Namn i brödsmulor' },
  seoBreadcrumbHint: { en: 'Instead of the title, when a shorter name fits better. The levels themselves follow from where the post sits.', sv: 'I stället för titeln, när ett kortare namn passar bättre. Själva nivåerna följer av var inlägget ligger.' },
  seoDescription: { en: 'Meta description', sv: 'Metabeskrivning' },
  seoSocialTitle: { en: 'Sharing title', sv: 'Delningstitel' },
  seoSocialDescription: { en: 'Sharing description', sv: 'Delningsbeskrivning' },
  seoSocialImage: { en: 'Sharing image', sv: 'Delningsbild' },
  seoSocialImageAlt: { en: 'Sharing image alt text', sv: 'Delningsbildens alternativtext' },
  seoSchema: { en: 'Structured data type', sv: 'Typ av strukturerad data' },
  seoNoindex: { en: 'Keep out of search engines', sv: 'Håll borta från sökmotorer' },
  seoNofollow: { en: 'Do not follow links', sv: 'Följ inte länkar' },
  settings: { en: 'Site settings', sv: 'Webbplatsinställningar' },
  siteTitle: { en: 'Site title', sv: 'Webbplatsens titel' },
  logo: { en: 'Logo', sv: 'Logotyp' },
  icon: { en: 'Site icon', sv: 'Webbplatsikon' },
  imageLibrary: { en: 'Image library', sv: 'Bildbibliotek' },
  libraryImage: { en: 'Image', sv: 'Bild' },
  caption: { en: 'Caption', sv: 'Bildtext' },
  libraryHint: { en: 'Copied into a post when the image is chosen there, where it can then be changed for that use.', sv: 'Kopieras in i ett inlägg när bilden väljs där, och kan sedan ändras för just den användningen.' },
  menus: { en: 'Menus', sv: 'Menyer' },
  entries: { en: 'Entries', sv: 'Poster' },
  entry: { en: 'Entry', sv: 'Post' },
  label: { en: 'Label', sv: 'Etikett' },
  labelHint: { en: "The post's title, if left empty.", sv: 'Inläggets titel om du lämnar den tom.' },
  post: { en: 'Post', sv: 'Inlägg' },
  url: { en: 'Address', sv: 'Adress' },
  perType: { en: 'By type of post', sv: 'Per inläggstyp' },
  otherAddresses: { en: 'Other addresses', sv: 'Andra adresser' },
  otherAddress: { en: 'Other address', sv: 'Annan adress' },
  answer: { en: 'Answer', sv: 'Svar' },
  otherShow: { en: 'Show the post here too', sv: 'Visa inlägget här också' },
  urlHint: { en: 'Only for an entry that does not lead to a post.', sv: 'Bara för en post som inte leder till ett inlägg.' },
};

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
 */
export function cmsConfig(description, { forgejo, repository, clientId, site, preview = null }) {
  const say = (key) => inLanguage(TEXTS[key], description.language);
  const several = description.languages.length > 1;
  const within = (extra) => (several ? extra : {});
  const { forms } = declaredNames(description);

  const required = (field) => ({ required: field === true });

  const imageField = (name, label, extra = {}, withAlt = true) => ({
    name,
    label,
    widget: 'object',
    ...extra,
    fields: [
      { name: 'src', label: say('file'), widget: 'image', required: true },
      ...(withAlt ? [{ name: 'alt', label: say('alt'), widget: 'string', required: false, ...within(TRANSLATED) }] : []),
    ],
  });

  // The post a choice of one leads to. A relation names one collection, so a choice
  // of a post is among pages where the site has them, and otherwise among the first
  // type with an address.
  const chooseAmong = () => {
    const types = Object.values(description.types).filter((type) => type.address !== null);
    return types.find((type) => type.name === 'page') ?? types[0] ?? null;
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
      label: setting.label,
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
      label: setting.label,
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
    label,
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

  // Closed, since an editor who sets none of it leaves the type's templates to say it, and in
  // parts, since all of it open is a lot to take in (ADR 0029).
  const seoField = (field) => {
    const keys = {
      title: { widget: 'string', hint: say('seoFollows') },
      breadcrumb: { widget: 'string', hint: say('seoBreadcrumbHint') },
      description: { widget: 'text' },
      socialTitle: { widget: 'string', hint: say('seoFollows') },
      socialDescription: { widget: 'text' },
      socialImage: { widget: 'image' },
      socialImageAlt: { widget: 'string', hint: say('seoImageAltHint') },
      schema: { widget: 'select', options: [...SCHEMA_TYPES] },
      noindex: { widget: 'boolean' },
      nofollow: { widget: 'boolean' },
    };
    const onePart = (name, inPart) => ({
      name,
      label: say(`seoPart${name[0].toUpperCase()}${name.slice(1)}`),
      widget: 'object',
      required: false,
      accordion: true,
      collapsed: true,
      ...within(TRANSLATED),
      fields: inPart.map((key) => ({
        name: key,
        label: say(`seo${key[0].toUpperCase()}${key.slice(1)}`),
        required: false,
        ...keys[key],
        ...within(TRANSLATED),
      })),
    });
    return {
      name: field.name,
      label: say('seo'),
      widget: 'object',
      required: false,
      accordion: true,
      collapsed: true,
      ...within(TRANSLATED),
      fields: Object.entries(SEO_PARTS).map(([name, inPart]) => onePart(name, inPart)),
    };
  };

  const postField = (field) => {
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
        return seoField(field);
      case 'terms':
        return {
          name: field.name,
          label: field.taxonomy.plural,
          ...relation(field.taxonomy.collection, 'name', { allow_add: true }),
          multiple: true,
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
      { name: 'address', label: say('url'), widget: 'string' },
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
    label: type.plural,
    label_singular: type.label,
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
      { name: 'title', label: say('title'), widget: 'string', ...within(TRANSLATED) },
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
      { name: 'body', label: say('body'), widget: BODY_WIDGET, required: false, elements: type.elements, forms, ...(description.images?.smallestWidth ? { smallestWidth: description.images.smallestWidth } : {}), ...within(TRANSLATED) },
      { name: 'slug', label: say('slug'), widget: 'string', required: false, hint: say('slugHint'), ...within(SAME_IN_EACH) },
      ...(type.hierarchical
        ? [{ name: 'parent', label: say('parent'), ...relation(type.collection, 'title'), required: false, ...within(SAME_IN_EACH) }]
        : []),
      ...type.fields.map(postField).filter(Boolean),
      ...(type.address === null ? [] : [otherAddressesField()]),
    ],
  });

  const taxonomyCollection = (taxonomy) => ({
    name: taxonomy.collection,
    label: taxonomy.plural,
    label_singular: taxonomy.label,
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
      { name: 'description', label: say('description'), widget: 'text', required: false, ...within(TRANSLATED) },
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
    slug: SLUG,
    fields: [
      { name: 'src', label: say('file'), widget: 'image', required: true },
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

  return {
    load_config_file: false,
    // Konzilo's own, which the editor takes out before Sveltia sees the rest: where this copy
    // of the site has its live preview, and which collections have pages to show there.
    ...(preview === null ? {} : {
      konzilo: { preview: { origin: preview, collections: Object.values(description.types).filter((type) => type.address).map((type) => type.collection) } },
    }),
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
      ...(Object.values(description.types).some((type) => type.elements.includes('image')) ? [imageLibraryCollection()] : []),
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
                label: language ? `${menu.label} (${language.tag})` : menu.label,
                file: language ? `menus/${language.tag}/${menu.name}.json` : `menus/${menu.name}.json`,
                format: 'json',
                fields: [entriesField(MENU_DEPTH)],
              }))),
            },
          ]),
    ],
  };
}
