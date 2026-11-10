// The editor on the admin host: Sveltia, with the configuration this copy of the
// site was given (ADR 0029), in the editor's interface language (ADR 0066). Importing it
// comes after the flag that stops it starting by itself, and after the preferences it
// reads as it loads, the interface language among them, which is why Sveltia is
// imported only once the configuration has said what the site's language is.

import './manual-start.js';
import './set-preferences.js';

import { useComponents } from './body/components.js';
import { registerBodyField } from './body/register.js';
import { registerPreview } from './preview/template.js';
import { registerImageField } from './image/register.js';
import { registerParts } from './parts/register.js';
import { registerStructureField } from './structure/register.js';
import { registerPublishing } from './publishing/register.js';
import { chosenLanguage, followSite, languageChanged } from './interface-language.js';
import './form.css';
// The preview's window hides its pane by these; template.js, which shows it, is read by tests too.
import './preview-window/window.css';
import { say } from './body/texts.js';

// The words of the editor's choice of where the preview stands, which the patched menu reads.
globalThis.__KONZILO_VIEW_WORDS__ = { beside: say('viewBeside'), window: say('viewWindow'), toggle: say('viewToggle'), off: say('viewOff') };

// The configuration in the language the editor has chosen, else in the site's, which an
// editor who has chosen none then takes in Sveltia's own interface too.
const chosen = chosenLanguage();
const answer = await fetch(chosen === null ? './config.json' : `./config.${chosen}.json`, { cache: 'no-store' });
if (!answer.ok) throw new Error(`no configuration: ${answer.status}`);
// What is Konzilo's own stays out of what Sveltia is given.
const { konzilo, ...config } = await answer.json();
if (chosen === null) followSite(konzilo.language);
const { default: CMS } = await import('@sveltia/cms');
useComponents(konzilo.components);
registerBodyField(CMS, config);
registerPublishing(CMS, config);
registerParts(CMS, config);
registerImageField(CMS, config);
registerStructureField(CMS, config);
if (konzilo.preview) registerPreview(CMS, config, konzilo.preview);
CMS.init({ config });

// A language chosen in Sveltia's preferences shows in Sveltia at once, which then names it
// on the page; the editor loads again for its own texts to follow, once Sveltia has kept it.
new MutationObserver(() => {
  setTimeout(() => {
    if (languageChanged(chosen)) window.location.reload();
  });
}).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
