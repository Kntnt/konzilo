// The editor on the admin host: Sveltia, with the configuration this copy of the
// site was given (ADR 0029). Importing it comes after the flag that stops it starting
// by itself, which is why the flag has a module of its own.

import './manual-start.js';
import CMS from '@sveltia/cms';

import { registerBodyField } from './body/register.js';
import './form.css';

const answer = await fetch('./config.json', { cache: 'no-store' });
if (!answer.ok) throw new Error(`no configuration: ${answer.status}`);
const config = await answer.json();
registerBodyField(CMS, config);
CMS.init({ config });
