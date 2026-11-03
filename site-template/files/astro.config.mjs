import { defineConfig } from 'astro/config';
import konzilo from '@kntnt/konzilo/astro';

// Every page is built for the site's public host, which the build's environment
// names. A local copy answers at Astro's dev server.
process.env.KONZILO_ORIGIN ??= 'http://localhost:4321';

export default defineConfig({
  // Konzilo's integration sets the Markdown reader and loads the site's body
  // styles on every page; the templates wrap a post's body in the class
  // `body-text`. It renders each post list with the component of the
  // presentation it names, one for each that site-description.json declares,
  // and a list that matches nothing and has no text of its own with Konzilo's
  // text in the page's language, which `emptyList`, or `texts` per language,
  // would give the site's own of, and a form a post's body places with the
  // site's form component, as a template places one. It puts the search page at
  // the address site-description.json declares, and the term page at the
  // address of each taxonomy that declares one. The tokens name the custom
  // properties that hold the site's colours: `primary` and `base` are the web
  // app manifest's colours and each page's theme-color.
  integrations: [konzilo({
    bodyStyles: ['./src/styles/body.css'],
    presentations: { list: './src/components/List.astro', cards: './src/components/Cards.astro' },
    directives: { form: './src/components/Form.astro' },
    searchPage: './src/components/SearchPage.astro',
    termPage: './src/components/TermPage.astro',
    tokens: {
      colors: {
        base: '--body-background',
        primary: '--body-link',
      },
    },
  })],
  // Code blocks take their colours from the body styles' custom properties.
  markdown: {
    shikiConfig: { theme: 'css-variables' },
  },
  // The dev server shows the pages as the public site does. Astro's dev
  // toolbar would sit over them at the foot of the window, where the
  // consent banner is.
  devToolbar: { enabled: false },
});
