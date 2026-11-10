// The consent script: one file per language that shows a site's consent on
// a page the site does not build, such as a page of another system below
// the same domain, from the same registry, so that one choice holds on
// both. consentScript() gives its source; Konzilo's build writes it at
// /_konzilo/consent/<language>.js (registry.js, consentScriptPath()), and a
// site Konzilo does not build can write it there with its own build.
//
// The page that loads it needs only:
//
// - `<script src="https://www.example.com/_konzilo/consent/en.js" defer>`,
//   and the stylesheet beside it, /_konzilo/consent/consent.css, or one of
//   its own on the classes of docs/site-design.md;
// - its own footer buttons, `<button type="button"
//   data-konzilo-consent-action="change" hidden>` and `"withdraw"`, which
//   the script shows;
// - an element marked `data-konzilo-consent-declaration` where the cookie
//   declaration goes, whose own content stays where the script does not
//   run;
// - on the privacy policy and the cookie policy, `<meta
//   name="konzilo-consent" content="legal-page">` in its head, where the
//   banner then stays hidden;
// - optionally, its own privacy policy and cookie policy, `<link
//   rel="privacy-policy" href="…">` and `<link rel="cookie-policy"
//   href="…">` in its head, each with an optional `title`, which the
//   banner, the placeholders and the declaration then link to in place of
//   the site's own (client.js, placeConsent());
// - optionally, where the site counts visits without storage before
//   consent, the right to object, `<div data-konzilo-consent-objection
//   hidden></div>`, such as in its privacy policy, which the script fills
//   as the dialog has it and shows while the visitor allows no statistics;
// - each embed in the markup of ADR 0024, `<figure class="konzilo-embed"
//   data-embed="<service>">` with the player in a <template>, which the
//   script makes a placeholder until the visitor allows the service.
//
// The script adds the banner, the notice, the dialogs and the placeholders'
// templates to the end of the body, fills the declaration, and gives the
// consent signal, window.konziloConsent, as soon as it has run, so that a
// later deferred script on the page reads the stored choice at once, and
// the `konzilo:consent` event on the document at every change. It loads
// nothing else and runs no inline code. On a page that has the signal
// already, from Konzilo's own script, it does nothing.
//
// This folder imports nothing outside itself.

import { consentClient, cookieDeclaration, datawrapperHeights, embedPanels, matomoTracker, placeConsent } from './client.js';
import { consentMarkup, cookieDeclarationMarkup } from './markup.js';

// The source of the consent script for pages in one language.
//
// `input`: what the markup functions take (markup.js), `{ registry, texts,
// legalPages, language, host }`, the legal pages as absolute addresses, since
// the page that links to them is on another host, and `host` null, so that
// an item stored on the page's own host is named from the page's address.
// `options`, the client's (client.js): `domain`, the shared domain the
// choice is kept on, or null; `records`, the absolute address of an
// endpoint for consent records that takes them from these pages, or null,
// where none is sent and no consent ID is made or shown; and `statistics`
// and `matomo`, matomoTracker()'s, where the script is to load Matomo's
// own tracker too, which it does not by default.
export function consentScript(input, { domain = null, records = null, statistics = null, matomo = null } = {}) {
  const consent = consentMarkup(input);
  const declaration = cookieDeclarationMarkup(input, { records });
  const tracker = matomo ? { ...statistics, ...matomo } : null;
  const parts = [
    `(${placeConsent})(${JSON.stringify(consent)}, ${JSON.stringify(declaration)});`,
    `(${consentClient})(${JSON.stringify({ domain, records })});`,
    `(${matomoTracker})(${JSON.stringify(tracker)});`,
    `(${cookieDeclaration})();`,
    `(${embedPanels})();`,
    `(${datawrapperHeights})();`,
  ];
  return [
    '// The consent of this site, for a page it does not build.',
    '(() => {',
    "  if ('konziloConsent' in window) return;",
    '  const run = () => {',
    ...parts,
    '  };',
    "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);",
    '  else run();',
    '})();',
    '',
  ].join('\n');
}
