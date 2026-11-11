// The structured data of a page: one JSON-LD graph, which the
// integration's Head component writes as the page's one
// `<script type="application/ld+json">`, from the values its search and
// sharing tags are made of (search-and-sharing.js). Each node has a stable
// `@id` on the public host, by which the others name it:
//
// - `<origin>/#website`, the WebSite: the site's title and description, its
//   address, its language and its publisher;
// - `<origin>/#publisher`, the publisher of the Search and sharing
//   settings, an Organization or a Person: its name, the site's address, the
//   site's logo (an Organization's `logo`, a Person's `image`), its
//   profiles, email, telephone, postal address, organisation number
//   (`taxID`) and VAT number (`vatID`);
// - `<page address>#webpage`, the page, typed by its structured data type
//   when that is a kind of web page, else a WebPage: its title tag, meta
//   description, address, website, language, image and, where its type
//   declares them, its date and last change;
// - `<page address>#article`, for the Article types alone, the article the
//   page holds: the post's title, the description, its date and last change,
//   its image, its authors as its author, in the order its editor gave them,
//   or the publisher where it has none, and the publisher as its publisher;
// - `<origin>/#author-<slug>`, each of an article's authors (authors.js), a
//   Person: its name and its page's address where the authors have pages;
// - `<page address>#primaryimage`, the image the page shares, as its head's
//   sharing tags give it, with its size and its alt text as its caption;
// - `<page address>#breadcrumb`, the BreadcrumbList of the page's
//   breadcrumbs (breadcrumb-levels.js), which its web page names
//   as its `breadcrumb`: a ListItem for each level, from the start page to
//   the page itself, with its position from 1, its name and its address on
//   the public host.
//
// A value the site has not got is left out, and so is a node with nothing
// to say: the article on a page of another type, the image on a page that
// shares none, the breadcrumbs on the start page.

// A kind of web page is the page's own node's type, and a kind of article gives the page an
// article node (built-in-types.js).
import { isKindOfArticle, isKindOfWebPage } from '../format/built-in-types.js';

// The graph of a page, as JSON-LD: `page`, { title, description, schema,
// headline, published, modified }, its title tag, meta description,
// structured data type, which makes it an article's where it is a kind of
// article, the post's title (none on a page of the site's own) and its date
// and last change as Open Graph writes them, each '' where the page has none; `url`, its canonical address; `origin`, the public
// host's; `languageTag`, the site's language tag; `siteTitle`, the site's title;
// `search`, the Search and sharing settings; `image`, the image it shares,
// { src, width, height, alt }, or null; `logo`, the site's logo in the same
// form, or null; `breadcrumbs`, the page's levels, each { name, url }, its
// name and its address on the public host, none on the start page;
// `authors`, an article's authors, in order, each { name, slug, url }, its
// page's address on the public host or null, none on another page.
export function structuredData({ page, url, origin, languageTag, siteTitle, search = {}, image = null, logo = null, breadcrumbs = [], authors = [] }) {
  const home = new URL('/', origin).href;
  const website = { '@id': `${home}#website` };
  const publisher = { '@id': `${home}#publisher` };
  const webpage = { '@id': `${url}#webpage` };
  const primaryImage = image && { '@id': `${url}#primaryimage` };
  const breadcrumb = breadcrumbs.length > 0 && { '@id': `${url}#breadcrumb` };
  // A post whose structured data type is a kind of article has an article node of that type.
  const article = isKindOfArticle(page.schema);
  const people = article ? authors.map((author) => ({ ...author, '@id': `${home}#author-${author.slug}` })) : [];
  const nodes = [
    present({
      '@type': 'WebSite',
      ...website,
      url: home,
      name: siteTitle,
      description: search.description,
      inLanguage: languageTag,
      publisher,
    }),
    publisherNode(search.publisher ?? {}, { ...publisher, url: home }, logo),
    present({
      '@type': isKindOfWebPage(page.schema) ? page.schema : 'WebPage',
      ...webpage,
      url,
      name: page.title,
      description: page.description,
      isPartOf: website,
      breadcrumb,
      inLanguage: languageTag,
      primaryImageOfPage: primaryImage,
      datePublished: page.published,
      dateModified: page.modified,
    }),
    article && present({
      '@type': page.schema,
      '@id': `${url}#article`,
      headline: page.headline,
      description: page.description,
      datePublished: page.published,
      dateModified: page.modified || page.published,
      image: primaryImage,
      author: people.length > 0 ? people.map((person) => ({ '@id': person['@id'] })) : publisher,
      publisher,
      mainEntityOfPage: webpage,
      inLanguage: languageTag,
    }),
    ...people.map((person) => present({ '@type': 'Person', '@id': person['@id'], name: person.name, url: person.url })),
    image && { ...imageObject(image), ...primaryImage },
    breadcrumb && {
      '@type': 'BreadcrumbList',
      ...breadcrumb,
      itemListElement: breadcrumbs.map(({ name, url: item }, index) => ({ '@type': 'ListItem', position: index + 1, name, item })),
    },
  ];
  return { '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) };
}

// The graph as the text of its script in the page: JSON, with every `<`
// escaped, so that no text in it can end the script or open a comment.
export function graphScript(graph) {
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}

// The publisher, as the Search and sharing settings give it, an
// Organization unless they say Person, with `@id` and `url`, `named`.
function publisherNode(publisher, named, logo) {
  const kind = publisher.kind === 'Person' ? 'Person' : 'Organization';
  const address = present({
    streetAddress: publisher.street,
    postalCode: publisher.postalCode,
    addressLocality: publisher.locality,
    addressCountry: publisher.country,
  });
  return present({
    '@type': kind,
    '@id': named['@id'],
    name: publisher.name,
    url: named.url,
    // schema.org gives an Organization a logo, and a Person an image.
    [kind === 'Person' ? 'image' : 'logo']: logo && imageObject(logo),
    sameAs: profiles(publisher.profiles),
    email: publisher.email,
    telephone: publisher.telephone,
    address: Object.keys(address).length === 0 ? null : { '@type': 'PostalAddress', ...address },
    taxID: publisher.organisationNumber,
    vatID: publisher.vatNumber,
  });
}

// The publisher's profiles, one address per line as the Admin wrote them:
// each https address, as written, in order; a line that is none is left out.
function profiles(text = '') {
  return text.split('\n').map((line) => line.trim()).filter((line) => {
    try {
      return new URL(line).protocol === 'https:';
    } catch {
      return false;
    }
  });
}

// An image, { src, width, height, alt }, as an ImageObject: its address on
// the public host, its size in pixels and its alt text as its caption.
function imageObject({ src, width, height, alt }) {
  return present({ '@type': 'ImageObject', url: src, contentUrl: src, width, height, caption: alt });
}

// A node with only the values it has: none of undefined, null, false, ''
// or an empty list.
function present(node) {
  return Object.fromEntries(Object.entries(node).filter(([, value]) => value !== undefined && value !== null && value !== false && value !== '' && !(Array.isArray(value) && value.length === 0)));
}
