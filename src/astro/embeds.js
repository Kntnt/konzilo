// Embeds: a paragraph that holds nothing but the
// address of content from a service the site embeds from shows that
// content, as a panel that loads nothing from the service until the visitor
// consents to it.
//
// The panel is a figure with a sentence that the site's script has not
// run, a link to the address, which leads to the service, and the
// service's player in a <template>, whose content a browser does not load.
// The integration's script (embedPanels) takes the sentence away: it loads
// the player in the panel's place once the visitor allows the service, and
// until then makes the panel the consent placeholder. Without JavaScript,
// or when the script fails to load, the panel keeps its sentence and its
// link, and loads nothing.
//
// Which addresses a service takes, and the player each one gives, is the
// rule data's (format/rules.json, `embeds`), read with embedOf().

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedOf } from '../format/embeds.js';
import rules from '../format/rules.json' with { type: 'json' };
import { inLanguage } from '../texts.js';

const element = (tagName, properties, children = []) => ({ type: 'element', tagName, properties, children });

// What a panel says until the site's script runs, in the core's languages.
const NO_SCRIPT = {
  en: 'The site\'s script has not run, so this content can neither ask for your consent nor load.',
  sv: 'Webbplatsens skript har inte körts, så innehållet kan varken be om ditt samtycke eller laddas.',
};

// A panel's sentence that the site's script has not run, for a site in
// `locale` (English for null).
export function noScriptSentence(locale = null) {
  return inLanguage(NO_SCRIPT, locale);
}

// The panel for an address, as a hast element, its sentence in the language
// of a site in `locale` (English for null); null for an address the site
// does not embed. It carries Konzilo's own class, which the script finds it
// by.
export function embedElement(address, locale = null) {
  const embed = embedOf(address, rules);
  if (embed.reason) return null;
  const size = embed.height ? `height: ${embed.height}px` : `aspect-ratio: ${embed.ratio}`;
  const player = element('iframe', {
    src: embed.player,
    title: embed.name,
    ...(embed.allow ? { allow: embed.allow } : {}),
    allowFullScreen: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
    style: `display: block; width: 100%; ${size}; border: 0`,
  });
  return element('figure', { className: ['konzilo-embed'], dataEmbed: embed.service }, [
    element('p', { className: ['konzilo-embed-no-script'] }, [{ type: 'text', value: noScriptSentence(locale) }]),
    element('a', { href: address }, [{ type: 'text', value: address }]),
    element('template', {}, [player]),
  ]);
}

// What each service's players are given of the page's permissions: the origins they load from, by the rule data's `player` of each
// form, and the features of the permissions policy, those the service's
// `allow` names and fullscreen, which `allowFullScreen` above gives every
// player. The public site's permissions policy gives each of these features
// to these origins, so that the frame's delegation holds.
export function playerPermissions(services = rules.embeds.services) {
  return Object.values(services).map((service) => ({
    origins: [...new Set(service.addresses.map(({ player }) => new URL(player).origin))],
    features: [...new Set(['fullscreen', ...(service.allow ?? '').split(';').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean)])],
  }));
}

// The address a paragraph holds, when it holds nothing but a link whose text
// is its own address: `https://…` on a line of its own, or `<https://…>`.
function loneAddress(paragraph) {
  const [link, ...rest] = paragraph.children;
  if (rest.length > 0 || link?.type !== 'element' || link.tagName !== 'a') return null;
  if (Object.keys(link.properties).join() !== 'href') return null;
  const [text, ...more] = link.children;
  return more.length === 0 && text?.type === 'text' && text.value === link.properties.href ? text.value : null;
}

// Sätteri's HTML tree plugin that turns such a paragraph into its panel,
// for a site in `locale`. On a site in several `languages`, a
// panel in a content file in a language's folder, content/<collection>/<tag>/,
// is in that language. The plugin names the languages: Astro keeps a body
// it rendered until the body or the site's configuration changes, and the
// plugins are part of the configuration, so a site that changes its
// languages gets every panel again in the new ones.
export function embedsIn(locale, languages = []) {
  return {
    name: 'konzilo-embeds',
    language: locale,
    languages: languages.map((language) => language.locale),
    element: {
      filter: ['p'],
      visit(node, ctx) {
        const address = loneAddress(node);
        const panel = address && embedElement(address, fileLanguage(ctx.fileURL, languages) ?? locale);
        if (panel) ctx.replaceNode(node, panel);
      },
    },
  };
}

// The locale of the language whose folder a content file is in, on a site
// in several languages, or null.
function fileLanguage(fileURL, languages) {
  if (languages.length <= 1 || fileURL === undefined) return null;
  const folders = decodeURIComponent(fileURL.pathname).split('/').slice(0, -1);
  return languages.find((language) => folders.includes(language.tag))?.locale ?? null;
}

// The script of the site's panels, which the integration puts
// into every page's script file after the consent client's, whose signal,
// window.konziloConsent, it reads. A panel of a service the visitor allows
// loads its player in its place at once, and one the visitor comes to allow
// the moment the signal says so, without a reload. Any other panel asks
// for consent to its service: the page holds, from the consent banner's
// component, a <template> per such service with the question, the sentence
// on what the service stores and the button, which the script puts before
// the panel's link. The button allows that service alone, as given in a
// placeholder, which loads every panel of it on the page and gives the
// focus to the player of the panel pressed. A panel of a service with no
// such template keeps its link alone. It runs in the visitor's browser, so
// it uses nothing from this module.
// The pages of a built site with an embed and nothing to ask for consent with, whose visitors get
// its bare address: the question stands in ConsentBanner.astro, which a site's layout places.
export function pagesWithBareEmbeds(dir) {
  const release = fileURLToPath(dir);
  return readdirSync(release, { recursive: true })
    .filter((path) => path.endsWith('.html'))
    .filter((path) => {
      const html = readFileSync(join(release, path), 'utf8');
      return html.includes('class="konzilo-embed"') && !html.includes('data-konzilo-consent-placeholder');
    })
    .sort();
}

export function embedPanels() {
  const consent = window.konziloConsent;
  const asks = new Map([...document.querySelectorAll('[data-konzilo-consent] > template[data-konzilo-consent-placeholder]')]
    .map((template) => [template.dataset.konziloConsentPlaceholder, template]));
  const waiting = () => [...document.querySelectorAll('figure.konzilo-embed[data-embed]')].filter((panel) => panel.querySelector(':scope > template'));

  const load = (panel) => {
    const player = panel.querySelector(':scope > template').content.querySelector('iframe');
    if (player) panel.replaceChildren(player.cloneNode(true));
  };
  const ask = (panel) => {
    panel.querySelector(':scope > .konzilo-embed-no-script')?.remove();
    const placeholder = asks.get(panel.dataset.embed);
    if (placeholder && !panel.querySelector(':scope > .konzilo-embed-allow')) panel.prepend(placeholder.content.cloneNode(true));
  };
  const show = () => {
    for (const panel of waiting()) {
      if (consent?.service(panel.dataset.embed)) load(panel);
      else ask(panel);
    }
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('figure.konzilo-embed > .konzilo-embed-allow');
    if (!button) return;
    const panel = button.parentElement;
    consent?.allow(panel.dataset.embed);
    panel.querySelector(':scope > iframe')?.focus();
  });
  document.addEventListener('konzilo:consent', show);
  show();
}

// The script that lets a loaded Datawrapper chart set its own height, as
// Datawrapper's own embed code listens for its messages, beside the script
// above. It runs in the visitor's browser, so it uses nothing from
// this module.
export function datawrapperHeights() {
  window.addEventListener('message', (event) => {
    const heights = event.origin === 'https://datawrapper.dwcdn.net' ? event.data?.['datawrapper-height'] : undefined;
    if (!heights || typeof heights !== 'object') return;
    for (const player of document.querySelectorAll('figure.konzilo-embed > iframe')) {
      if (player.contentWindow !== event.source) continue;
      for (const height of Object.values(heights)) if (Number(height) > 0) player.style.height = `${Number(height)}px`;
    }
  });
}
