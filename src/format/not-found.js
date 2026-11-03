// The 404 page: the post an Admin chooses in the core's settings
// group `notFound` (settings-groups.json), which the site shows at every
// address nothing else answers, with `404`, and where a redirect rule answers
// `404` or `410`, with that status. The intake writes its title and body as
// content/not-found.md, the one entry of Astro's collection `notFound`, and
// leaves it out of its type's collection and out of settings.json. So it has
// no address of its own, and no list, feed, sitemap or search holds it: a
// reference to it leads nowhere, as one to a post without a page does
// (postTargets in addresses.js), and its own, old and other addresses answer
// as unknown.
//
// A chosen post that cannot serve, unpublished, in the trash, deleted,
// protected by a password or refused, leaves the site its template's plain
// text, and the build warns on the Site settings page.

// The group's name, in the option and on the Site settings page, and the
// collection's in Astro.
export const NOT_FOUND = 'notFound';

// The 404 page's content file, at the root of the content folder.
export const NOT_FOUND_FILE = 'not-found.md';

// On a site in several languages, the chosen page is the main
// language's 404 page, and its translation in each other language that
// language's, at `not-found/<tag>.md`, which the site shows at an address
// below that language's prefix that nothing else answers. A language with
// no such translation gets the template's plain text in that language, as
// a missing translation is never another language's page.
export const NOT_FOUND_FOLDER = 'not-found';
