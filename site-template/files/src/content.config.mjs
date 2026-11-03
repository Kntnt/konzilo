// The site's content collections, read from the content files in content/: one per post type and one per taxonomy of the site
// description, site-description.json, with schemas made from it.
import { collections as konziloCollections } from '@kntnt/konzilo/astro';

export const collections = konziloCollections();
