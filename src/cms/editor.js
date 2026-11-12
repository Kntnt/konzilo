// The editor on the admin host: Sveltia, with the configuration this copy of the
// site was given (ADR 0029), in the editor's interface language (ADR 0066). Importing it
// comes after the flag that stops it starting by itself, and after the preferences it
// reads as it loads, the interface language among them, which is why each has a module
// of its own.

import './manual-start.js';
import './set-preferences.js';
import './start-language.js';
import CMS from '@sveltia/cms';

import { useComponents } from './body/components.js';
import { registerBodyField } from './body/register.js';
import { registerPreview } from './preview/template.js';
import { registerImageField } from './image/register.js';
import { registerGroups } from './groups/register.js';
import { registerAuthorsField } from './authors/register.js';
import { registerParts } from './parts/register.js';
import { registerStructureField } from './structure/register.js';
import { registerPublishing } from './publishing/register.js';
import { registerSubmissions } from './submissions/register.js';
import { registerMail } from './mail/register.js';
import { registerSettings } from './settings/register.js';
import { chosenLanguage, followSite, languageChanged, loadedWith, say, useInterfaceLanguage } from './interface-language.js';
import './form.css';
// The preview's window hides its pane by these; template.js, which shows it, is read by tests too.
import './preview-window/window.css';

// The configuration in the language the editor has chosen, else in the site's
// (interface-language.js).
const chosen = chosenLanguage();
const answer = await fetch(chosen === null ? './config.json' : `./config.${chosen}.json`, { cache: 'no-store' });
if (!answer.ok) throw new Error(`no configuration: ${answer.status}`);
// What is Konzilo's own stays out of what Sveltia is given.
const { konzilo, ...config } = await answer.json();

// Sveltia has loaded in the site's language as the last load found it. Where this load
// finds it new to the browser, or changed, Sveltia starts again in it, before it shows anything.
if (chosen === null && followSite(konzilo.language)) window.location.reload();
else start();

function start() {
  const loaded = loadedWith(chosen);
  // The editor's own texts in the language the configuration is in, before anything is drawn.
  useInterfaceLanguage(konzilo.language);
  // The words of the editor's choice of where the preview stands, which the patched menu reads.
  globalThis.__KONZILO_VIEW_WORDS__ = { beside: say('preview.viewBeside'), window: say('preview.viewWindow'), toggle: say('preview.viewToggle'), off: say('preview.viewOff') };
  useComponents(konzilo.components);
  registerBodyField(CMS, config);
  registerPublishing(CMS, config);
  if (konzilo.forms) {
    registerSubmissions(CMS);
    registerMail(CMS);
  }
  // Before the parts' check at Save, which reads what the groups hold.
  registerGroups(CMS, config, konzilo.groups);
  registerParts(CMS, config);
  registerImageField(CMS, config);
  registerAuthorsField(CMS, config);
  registerStructureField(CMS, config);
  registerSettings(CMS);
  if (konzilo.preview) registerPreview(CMS, config, konzilo.preview);
  CMS.init({ config });

  // A language chosen in Sveltia's preferences shows in Sveltia at once, which then names it
  // on the page; the editor loads again for its own texts to follow, once Sveltia has kept it.
  new MutationObserver(() => {
    setTimeout(() => {
      if (languageChanged(loaded)) window.location.reload();
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}
