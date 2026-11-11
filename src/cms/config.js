// Sveltia's configuration, made from the site description and the settings
// groups, so that nothing is stored that could drift (ADR 0029), in one interface
// language: its labels are the core's catalogues' in that language, and the
// site's own as the site description gives them in it (ADR 0066). The source files
// it reads and writes are those ADR 0026 names: a post or a term under its
// collection's folder, named by an ID that never changes, and a reference by that
// ID. Empty optional fields are left out, since the intake's schemas refuse an
// empty string.

import { ARTICLE, AUTHORS, BUILT_IN_TYPES, CATEGORY, descriptionLabel, followsParts, keepsOrder, pageTypeOf, TOPICS } from '../format/built-in-types.js';
import { CANONICAL_PATTERN, publicAddress } from '../format/addresses.js';
import { IMAGE_LIBRARY_FOLDER } from '../format/masters.js';
import { declaredNames } from '../site-description.js';
import { SHARING_SAFE, SHARING_SIZE } from '../format/article-parts.js';
import { IMAGE_WIDGET } from './image/widget.js';
import { STRUCTURE_WIDGET } from './structure/widget.js';
import { AUTHORS_WIDGET } from './authors/widget.js';
import { SCHEMA_WIDGET, SLUG_WIDGET, TEXT_WIDGET } from './parts/widgets.js';
import { inCatalogue, labelIn, labelInPhrase, text } from '../catalogues.js';
import { BODY_WIDGET } from './body/widget.js';
import { PUBLISHING_WIDGET } from './publishing/widget.js';
import { BUILT_IN_FORMAT, GROUP_PREFIX, GROUP_WIDGET, OWN_FORMAT } from './groups/widget.js';
import { SETTING_WIDGET } from './settings/widget.js';

// How deep a menu's entries go in the form. Sveltia has no recursive field.
const MENU_DEPTH = 3;

const SLUG = { template: '{{uuid_short}}', editable: false };

// A post's title, which its form holds in its first field group, and which Sveltia names a post
// by, in its lists and in a choice of a post (ADR 0071).
const POST_TITLE = `${GROUP_PREFIX}name.title`;

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
  // The same where Sveltia puts it in the middle of a phrase of its own, such as "Skapar {name}":
  // its first letter lowered, but in an abbreviation (ADR 0066).
  const inPhrase = (label) => labelInPhrase(label, interfaceLanguage);
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
  const chooseAmong = () => pageTypeOf(description.types);

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

  // A value's field, by the type and control it is declared with. The core's settings give
  // their label, help and options' labels by language, as the catalogues hold them
  // (settings-groups.js), and a site's own its label as its site description does.
  const valueField = (setting) => {
    const common = {
      name: setting.name,
      label: own(setting.label),
      required: setting.required === true,
      ...(setting.help ? { hint: own(setting.help) } : {}),
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
          : { ...common, ...relation(among.collection, POST_TITLE), required: false };
      }
      case 'image':
        return imageField(setting.name, setting.label, { required: false });
      default:
        if (setting.control === 'select') {
          const options = setting.optionLabels ? setting.options.map((value) => ({ value, label: own(setting.optionLabels[value]) })) : setting.options;
          return { ...common, ...given, widget: 'select', options };
        }
        return { ...common, ...given, widget: setting.control === 'textarea' ? 'text' : 'string' };
    }
  };

  // A setting with a default is the core's field for a setting, which draws Sveltia's own field
  // with the default where the settings file holds no value (settings/register.js, ADR 0033).
  // Sveltia gives a field's default only where the file holds the setting's group, and writes it
  // into the file at the next save, so it is given none of its own.
  const withDefault = (made) => {
    if (!('default' in made)) return made;
    return { name: made.name, label: made.label, required: false, ...(made.hint ? { hint: made.hint } : {}), widget: SETTING_WIDGET, field: made };
  };

  // A setting that is translated holds a text per language on a site in several, which Sveltia
  // offers as "Lägg till {label}", so its label is as it stands there.
  const settingField = (setting) => {
    if (!setting.translated || !several) return withDefault(valueField(setting));
    return {
      name: setting.name,
      label: inPhrase(setting.label),
      widget: 'object',
      required: false,
      fields: description.languages.map((language) => withDefault(valueField({
        ...setting,
        name: language.locale,
        label: language.tag,
        translated: false,
        default: setting.defaults ? inCatalogue(setting.defaults, language.locale) : setting.default,
      }))),
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
    ...(hint ? { hint: own(hint) } : {}),
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

  // A post of a type with a teaser, every built-in type and a type of the site's own that
  // declares one, shows in its search and sharing fields what its teaser shows, as its head
  // does (article-parts.js); another type's leave it to its templates.

  // A post's own address, from which the canonical address field shows it while the post names
  // none: its type's address with `{slug}`, and on a site in several languages one for the
  // language of each pane, by its tag, after its prefix (parts/register.js).
  const ownAddress = (type) => {
    if (type.address === null) return null;
    if (!several) return publicAddress(type, '{slug}');
    return Object.fromEntries(description.languages.map((language) => [language.tag, publicAddress(type, '{slug}', language)]));
  };

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
        {
          name: 'canonical',
          label: say('seoCanonical'),
          widget: TEXT_WIDGET,
          fallback: 'ownAddress',
          address: ownAddress(type),
          placeholder: say('seoCanonicalOwn'),
          hint: say('seoCanonicalHint'),
          pattern: [CANONICAL_PATTERN, say('seoCanonicalPattern')],
        },
        { name: 'noindex', label: say('seoNoindex'), widget: 'boolean' },
        { name: 'nofollow', label: say('seoNofollow'), widget: 'boolean' },
      ]),
      group('sharing', [
        imageField('image', say('seoSocialImage'), { required: false, crop: [SHARING_SIZE.width, SHARING_SIZE.height], safe: [SHARING_SAFE.width, SHARING_SAFE.height], ...(type.fields.some((field) => field.kind === 'image') ? { fallback: true } : {}) }),
        { name: 'title', label: say('seoSocialTitle'), widget: 'string', ...shown('socialTitle') },
        { name: 'description', label: say('seoSocialDescription'), widget: 'text', ...(teaser ? { widget: TEXT_WIDGET, multiline: true, fallback: 'socialDescription' } : {}) },
      ]),
      group('structured', [
        // The structured data types the post's type offers, and its type's own, as the settings
        // give it before a site sets one: the first of them.
        { name: 'schema', label: say('seoSchema'), widget: SCHEMA_WIDGET, options: [...type.structuredDataTypes], type: type.name, typeLabel: inPhrase(type.plural), preset: type.structuredDataTypes[0] },
      ]),
    ];
  };

  // The teaser: what shows the post elsewhere, closed until an editor wants it otherwise. Its
  // image falls back to the main image, where the type has one; a page's and a canvas's to none.
  const teaserField = (field, type) => ({
    name: field.name,
    label: say('teaser'),
    widget: 'object',
    required: false,
    accordion: true,
    collapsed: true,
    ...within(TRANSLATED),
    fields: [
      imageField('image', say('file'), { required: false, ...(type.fields.some((one) => one.kind === 'image') ? { fallback: true } : {}) }),
      { name: 'headline', label: say('teaserHeadline'), widget: TEXT_WIDGET, fallback: 'teaserHeadline', required: false },
      { name: 'text', label: say('teaserText'), widget: TEXT_WIDGET, multiline: true, fallback: 'teaserText', required: false },
    ],
  });

  // A part of an article that is a text: its field, which shows what it falls back to, or is
  // a button until it is wanted. An optional part of the headline stands above or below it, with
  // no label of its own: its button, and then its placeholder, say what it is.
  const PARTS = {
    breadcrumb: { widget: TEXT_WIDGET, fallback: 'breadcrumb', hint: say('breadcrumbHint') },
    eyebrow: { widget: TEXT_WIDGET, add: say('addEyebrow'), placeholder: say('eyebrow'), labelled: false },
    headline: { widget: TEXT_WIDGET, placeholder: say('headline') },
    subheadline: { widget: TEXT_WIDGET, add: say('addSubheadline'), placeholder: say('subheadline'), labelled: false },
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
        return teaserField(field, type);
      case 'breadcrumb':
      case 'eyebrow':
      case 'headline':
      case 'subheadline':
      case 'standfirst': {
        return { name: field.name, label: say(field.kind), ...PARTS[field.kind], ...required(field.required), ...within(TRANSLATED) };
      }
      case 'terms':
        // Terms that keep the order the editor gives them, an article's authors, in the core's own
        // field, which reads and adds to their files where every term has one, in the main language.
        if (keepsOrder(field.taxonomy)) {
          const folder = several ? `${field.taxonomy.collection}/${description.languages.find((language) => language.main).tag}` : field.taxonomy.collection;
          return { name: field.name, label: own(field.taxonomy.plural), widget: AUTHORS_WIDGET, folder, ...required(field.required), ...within(SAME_IN_EACH) };
        }
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
  // the site keeps are the Redirects page's (ADR 0036). Sveltia counts a list and adds to it in
  // phrases of its own, so its labels are as they stand there.
  const otherAddressesField = () => ({
    name: 'otherAddresses',
    label: say('inPhrase.otherAddresses'),
    label_singular: say('inPhrase.otherAddress'),
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

  // A field group (ADR 0071): one section of the form, with one menu over every field it covers.
  // A group of the core's fields is the core's own field, which draws them and its menu; the
  // terms, which only Sveltia's relation draws, are an object, whose own menu covers them. Each
  // is a field of Sveltia's whose value holds its fields', and the editor keeps a source file
  // flat, by the fields each group holds in the format the file is read in (`konzilo.groups`).
  // On a site in several languages, a group's fields are all alike in each language, and so is
  // the group, or all per language.
  // A group of fields that declare no language, as a site's own fields do, is in the first language
  // alone, as each of them is.
  const languageOf = (fields) => {
    if (!several || fields.every((one) => one.i18n === undefined)) return {};
    return fields.every((one) => one.i18n === 'duplicate') ? SAME_IN_EACH : TRANSLATED;
  };
  const coreGroup = (name, label, fields) => ({
    name: `${GROUP_PREFIX}${name}`,
    label,
    widget: GROUP_WIDGET,
    required: false,
    // A new post's, from its fields' own; Sveltia gives a field's default to a new entry only.
    ...(fields.some((one) => 'default' in one) ? { default: Object.fromEntries(fields.filter((one) => 'default' in one).map((one) => [one.name, one.default])) } : {}),
    ...languageOf(fields),
    fields,
  });
  // Required, so that Sveltia shows its fields rather than a box to tick; each of them is as
  // required as it is declared.
  const termsGroup = (fields) => ({
    name: `${GROUP_PREFIX}terms`,
    label: fields.length === 1 ? fields[0].label : say('groupTerms'),
    widget: 'object',
    required: true,
    collapsed: false,
    ...languageOf(fields),
    fields,
  });

  // A group of the core's of one field, which would otherwise stand alone with Sveltia's menu: its
  // value is the field's own, under the field's name, so that no source file is read into it.
  const groupOfOne = (field) => ({ name: field.name, label: field.label, widget: GROUP_WIDGET, required: false, ...languageOf([field]), field });
  // What a group of the core's draws, through `CMS.getFieldType`: Sveltia's controls that may be
  // reused, and the core's own. Sveltia's relation is not among them.
  const DRAWN = ['string', 'text', 'number', 'select', 'datetime', IMAGE_WIDGET, TEXT_WIDGET, AUTHORS_WIDGET];
  // Sveltia's menu restores a field without a default to nothing, required or not, so a required
  // field without one that would stand alone stands in a group of the core's by itself, whose menu
  // keeps it at Restore Default. A required relation keeps Sveltia's menu.
  const standing = (made) => (made.required === true && !('default' in made) && DRAWN.includes(made.widget ?? 'string') ? groupOfOne(made) : made);

  // The fields that only a group holds, by the names the core gives them: wherever a post has
  // one, it is in the same group, so that a source file is read alike whatever its type.
  const NAME_FIELDS = ['title', 'breadcrumb', 'slug'];
  const STATUS_FIELDS = ['status', 'date'];
  const HEADLINE_FIELDS = ['eyebrow', 'headline', 'subheadline'];
  const TERMS_FIELDS = [AUTHORS, CATEGORY, TOPICS];

  // The order of a form, by its parts: `declared` is where the fields the site declares go, on a
  // built-in type its own after the body and before the closed bars. A page and a canvas take
  // the article's parts they have, in its order, beside their parent and body; their status says
  // whether they are published, as an article's does, so neither has a publishing row.
  const ARTICLE_FORM = ['name', 'status', 'image', 'terms', 'headline', 'standfirst', 'body', 'declared', 'teaser', 'seo', 'otherAddresses'];
  const PAGE_FORM = ['name', 'status', 'parent', 'body', 'declared', 'teaser', 'seo', 'otherAddresses'];
  const OWN_FORM = ['name', 'status', 'publishing', 'parent', 'body', 'declared', 'otherAddresses'];

  const typeFields = (type) => {
    const built = type.builtIn;
    const declared = (name) => type.fields.find((one) => one.name === name);
    const fieldOf = (name) => {
      const one = declared(name);
      return one ? postField(one, type) : null;
    };
    const head = type.fields.some((field) => field.kind === 'headline');
    // What an editor is here for first, and in sight when the entry opens, as Sveltia mounts
    // what lies further down only as it comes into view.
    // Where the type has a main headline of its own, the title is the post's working name.
    const title = head
      ? { name: 'title', label: say('workingName'), hint: say('workingNameHint'), widget: 'string', required: true, ...within(TRANSLATED) }
      : { name: 'title', label: say('title'), widget: 'string', required: true, ...within(TRANSLATED) };
    // Shown, and changed on purpose; a new post's follows its name in breadcrumbs, which is its
    // default too.
    const slug = { name: 'slug', label: say('slug'), widget: SLUG_WIDGET, address: typeof type.address === 'string' ? type.address : null, computed: 'slug', required: false, ...within(SAME_IN_EACH) };
    const status = {
      name: 'status',
      label: say('status'),
      widget: 'select',
      default: 'draft',
      required: true,
      options: ['draft', 'scheduled', 'published'].map((value) => ({ value, label: say(value) })),
      ...within(SAME_IN_EACH),
    };
    const date = fieldOf('date');
    const headline = HEADLINE_FIELDS.map(fieldOf).filter(Boolean);
    const terms = type.fields.filter((one) => TERMS_FIELDS.includes(one.name)).map((one) => postField(one, type));
    // A site's own fields on a built-in type, which the core's group draws: a value of the site's
    // own, which is never a post or an image. A term of a taxonomy of the site's own is Sveltia's
    // relation, and stands alone. A type of the site's own has its files read in a format of its
    // own, which holds no such group, so its fields stand as declared.
    const isOwn = (one) => built !== null && one.kind === 'meta';
    const mine = type.fields.filter(isOwn).map((one) => postField(one, type));
    // Fields in the order declared, with the core's in their groups, each where its first field
    // is: a type of the site's own, and the site's own fields on a built-in type.
    const inOrder = (fields) => {
      const placed = new Set();
      return fields.flatMap((one) => {
        if ([...NAME_FIELDS, ...STATUS_FIELDS].includes(one.name)) return [];
        const at = HEADLINE_FIELDS.includes(one.name) ? 'headline' : TERMS_FIELDS.includes(one.name) ? 'terms' : isOwn(one) ? 'own' : null;
        if (at === null) return postField(one, type) ?? [];
        if (placed.has(at)) return [];
        placed.add(at);
        return part(at) ?? [];
      });
    };
    const parts = {
      // On a site in several languages the name is each language's and the slug alike in each,
      // which Sveltia keeps of a field as a whole, so the slug is a group of its own there.
      name: () => (several
        ? [coreGroup('name', say('groupName'), [title, fieldOf('breadcrumb')].filter(Boolean)), coreGroup('slug', say('slug'), [slug])]
        : coreGroup('name', say('groupName'), [title, fieldOf('breadcrumb'), slug].filter(Boolean))),
      // The date and time under the status's choices, with no label of its own, and the time zone,
      // which Sveltia names, under them.
      status: () => coreGroup('status', date ? say('groupStatus') : say('status'), [status, date && { ...date, labelled: false }].filter(Boolean)),
      // How it stands on the site, which is nothing the file holds (ADR 0031). A built-in type's
      // status says whether it is published, and its page opens from beside the slug, so only a
      // type of the site's own has it.
      publishing: () => ({ name: 'publishing', label: say('publishing'), widget: PUBLISHING_WIDGET, required: false, ...within(SAME_IN_EACH) }),
      parent: () => (type.hierarchical ? { name: 'parent', label: say('parent'), ...relation(type.collection, POST_TITLE), required: false, ...within(SAME_IN_EACH) } : null),
      body: () => ({ name: 'body', label: say('body'), widget: type.editor === 'structure' ? STRUCTURE_WIDGET : BODY_WIDGET, required: false, elements: type.elements, forms, ...(description.images?.smallestWidth ? { smallestWidth: description.images.smallestWidth } : {}), ...within(TRANSLATED) }),
      headline: () => (headline.length === 0 ? null : coreGroup('headline', say('groupHeadline'), headline)),
      terms: () => (terms.length === 0 ? null : termsGroup(terms)),
      own: () => (mine.length === 0 ? null : coreGroup('own', say('groupOwn'), mine)),
      declared: () => inOrder(built ? type.fields.filter((one) => !Object.hasOwn(BUILT_IN_TYPES[built].fields, one.name)) : type.fields),
      otherAddresses: () => (type.address === null ? null : otherAddressesField()),
    };
    const part = (name) => (Object.hasOwn(parts, name) ? parts[name]() : fieldOf(name));
    const form = built ? (built === ARTICLE ? ARTICLE_FORM : PAGE_FORM) : OWN_FORM;
    return form.flatMap((name) => part(name) ?? []).map(standing);
  };

  const typeCollection = (type) => ({
    name: type.collection,
    label: own(type.plural),
    label_singular: inPhrase(type.label),
    folder: type.collection,
    extension: 'md',
    format: type.builtIn ? BUILT_IN_FORMAT : OWN_FORMAT,
    create: true,
    identifier_field: POST_TITLE,
    summary: `{{${POST_TITLE}}}`,
    slug: SLUG,
    ...within(TRANSLATED),
    fields: typeFields(type),
  });

  // Which fields each group holds, in every form of a format it is in, by the format, so that the
  // editor reads a source file's fields into it and writes them back flat.
  const groupsOf = (collections) => {
    const groups = {};
    for (const made of collections) {
      const held = (groups[made.format] ??= {});
      for (const one of made.fields.filter((field) => field.name.startsWith(GROUP_PREFIX))) {
        held[one.name] = [...new Set([...(held[one.name] ?? []), ...one.fields.map((member) => member.name)])];
      }
    }
    return groups;
  };
  const postCollections = Object.values(description.types).map(typeCollection);

  const taxonomyCollection = (taxonomy) => ({
    name: taxonomy.collection,
    label: own(taxonomy.plural),
    label_singular: inPhrase(taxonomy.label),
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
      { name: 'description', label: text(interfaceLanguage, descriptionLabel(taxonomy)), widget: 'text', required: false, ...within(TRANSLATED) },
    ],
  });

  // What an editor chooses from in a body (ADR 0055): no type, no page, and in one language, since
  // what a post holds of it is the post's own.
  const imageLibraryCollection = () => ({
    name: IMAGE_LIBRARY_FOLDER,
    label: say('imageLibrary'),
    label_singular: say('inPhrase.libraryImage'),
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
    ...(among === null ? [] : [{ name: 'post', label: say('post'), ...relation(among.collection, POST_TITLE), required: false }]),
    { name: 'url', label: say('url'), widget: 'string', required: false, hint: say('urlHint') },
    ...(depth > 1 ? [entriesField(depth - 1)] : []),
  ];
  const entriesField = (depth) => ({
    name: 'items',
    label: say('inPhrase.entries'),
    label_singular: say('inPhrase.entry'),
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
    // and which collections have pages to show there, the site's own components, which
    // its bodies may hold beside the core's elements, and the fields of each field group, by the
    // format a post's files are read in.
    konzilo: {
      language: interfaceLanguage,
      ...(preview === null ? {} : { preview: { origin: preview, collections: Object.values(description.types).filter((type) => type.address).map((type) => type.collection) } }),
      ...(Object.keys(components).length === 0 ? {} : { components }),
      groups: groupsOf(postCollections),
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
      ...postCollections,
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
