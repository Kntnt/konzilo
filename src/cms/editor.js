// The editor on the admin host: Sveltia, with the configuration this copy of the
// site was given (ADR 0029). Importing it comes after the flag that stops it starting
// by itself, and after the preferences it reads as it loads, which is why each has a
// module of its own.

import './manual-start.js';
import './set-preferences.js';
import CMS from '@sveltia/cms';

import { useComponents } from './body/components.js';
import { registerBodyField } from './body/register.js';
import { registerPreview } from './preview/template.js';
import { registerImageField } from './image/register.js';
import { registerParts } from './parts/register.js';
import { registerStructureField } from './structure/register.js';
import { registerPublishing } from './publishing/register.js';
import './form.css';
// The preview's window hides its pane by these; template.js, which shows it, is read by tests too.
import './preview-window/window.css';
import { say } from './body/texts.js';

// The words of the editor's choice of where the preview stands, which the patched menu reads.
globalThis.__KONZILO_VIEW_WORDS__ = { beside: say('viewBeside'), window: say('viewWindow'), toggle: say('viewToggle'), off: say('viewOff') };

const answer = await fetch('./config.json', { cache: 'no-store' });
if (!answer.ok) throw new Error(`no configuration: ${answer.status}`);
// What is Konzilo's own stays out of what Sveltia is given.
const { konzilo, ...config } = await answer.json();
useComponents(konzilo?.components);
registerBodyField(CMS, config);
registerPublishing(CMS, config);
registerParts(CMS, config);
registerImageField(CMS, config);
registerStructureField(CMS, config);
if (konzilo?.preview) registerPreview(CMS, config, konzilo.preview);
CMS.init({ config });
